import { Db } from '../lib/db';
import { nextRun } from '../lib/cron';
import { claimOne, executeRun } from '../lib/runner';
import { listHandlers } from '../automations/registry';
import { stageStatuses } from '../lib/pipeline';
import { ownerFromRequest, signState, verifyState } from '../lib/auth';
import { authorizeUrl, exchangeCode, storeTokens } from '../lib/tiktok';
import { log, errorFields } from '../lib/log';
import {
  ValidationError,
  createAccountSchema,
  createAutomationSchema,
  parseBody,
  updateAccountSchema,
  updateArtifactSchema,
  updateAutomationSchema,
  validateConfig,
} from '../lib/schemas';
import type { Automation, Env } from '../types';

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const ARTIFACT_TRANSITIONS: Record<string, string[]> = {
  // Only these moves are allowed from the dashboard; the rest belong to the
  // publish/reconcile automations.
  draft: ['approved', 'rejected'],
  approved: ['draft', 'rejected'],
  rejected: ['draft'],
  failed: ['draft', 'rejected'],
};

export async function handleApi(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api/, '');
  const db = new Db(env);

  // --- TikTok OAuth callback: no session, authenticated by signed state ---
  if (path === '/tiktok/callback') {
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    if (!code || !state) return json({ error: 'missing code or state' }, 400);

    const payload = await verifyState<{ account_id: string }>(state, env.TOKEN_ENCRYPTION_KEY);
    if (!payload) return json({ error: 'invalid or expired state' }, 400);

    try {
      const tokens = await exchangeCode(env, code);
      await storeTokens(env, db, payload.account_id, tokens);
      log.info('tiktok account connected', { account_id: payload.account_id });
      return Response.redirect(`${url.origin}/accounts?connected=1`, 302);
    } catch (err) {
      log.error('tiktok connect failed', { account_id: payload.account_id, ...errorFields(err) });
      await db.update('tiktok_accounts', `id=eq.${payload.account_id}`, { status: 'error' });
      const message = err instanceof Error ? err.message : String(err);
      return Response.redirect(`${url.origin}/accounts?error=${encodeURIComponent(message)}`, 302);
    }
  }

  // --- everything below requires the owner's session ---
  const owner = await ownerFromRequest(req, env);
  if (!owner) return json({ error: 'unauthorized' }, 401);

  if (path === '/me' && req.method === 'GET') {
    return json({ email: owner });
  }

  if (path === '/handlers' && req.method === 'GET') {
    return json({ handlers: listHandlers() });
  }

  // The honest pipeline view: which stages actually work in this deployment.
  if (path === '/pipeline' && req.method === 'GET') {
    return json({ stages: stageStatuses(env) });
  }

  // --- automations ---

  if (path === '/automations' && req.method === 'POST') {
    const body = await parseBody(req, createAutomationSchema);
    const config = validateConfig(body.handler_key, body.config);
    const next = body.cron && body.enabled ? nextRun(body.cron) : null;

    const created = await db.insert<Automation>('automations', {
      handler_key: body.handler_key,
      name: body.name,
      description: body.description ?? null,
      app_id: body.app_id ?? null,
      cron: body.cron ?? null,
      enabled: body.enabled,
      config,
      icon: body.icon ?? 'gear',
      accent: body.accent ?? null,
      kind: body.kind ?? 'system',
      next_run_at: next ? next.toISOString() : null,
    });
    return json(created, 201);
  }

  const automationMatch = path.match(/^\/automations\/([0-9a-f-]{36})(\/run)?$/);
  if (automationMatch) {
    const id = automationMatch[1]!;
    const automation = await db.selectOne<Automation>('automations', `id=eq.${id}&select=*`);
    if (!automation) return json({ error: 'not found' }, 404);

    // Manual trigger. The claim is atomic, so a manual run racing the cron
    // dispatcher loses cleanly rather than both executing.
    if (automationMatch[2] && req.method === 'POST') {
      const claimed = await claimOne(env, id);
      if (!claimed) return json({ error: 'already running' }, 409);

      // Run after responding so the dashboard gets its answer immediately and
      // can start polling logs.
      ctx.waitUntil(
        executeRun(env, claimed, 'manual').catch(async (err) => {
          log.error('manual run failed', { automation_id: id, ...errorFields(err) });
          // Release the claim the failed run would otherwise hold.
          await db
            .update('automations', `id=eq.${id}`, {
              status: 'failed',
              running_since: null,
              current_task: null,
            })
            .catch(() => undefined);
        }),
      );
      return json({ ok: true, automation_id: id }, 202);
    }

    if (req.method === 'PATCH') {
      const body = await parseBody(req, updateAutomationSchema);
      const patch: Record<string, unknown> = {};

      for (const field of ['name', 'description', 'app_id', 'icon', 'accent'] as const) {
        if (field in body) patch[field] = body[field];
      }

      if ('config' in body) {
        patch.config = validateConfig(automation.handler_key, body.config);
      }

      if ('cron' in body) patch.cron = body.cron ?? null;

      if ('enabled' in body) {
        patch.enabled = body.enabled;
        // Re-enabling clears a tripped breaker, otherwise it would refuse to
        // schedule and look broken for no visible reason.
        if (body.enabled) {
          patch.failure_streak = 0;
          if (automation.status === 'disabled' || automation.status === 'failed') patch.status = 'idle';
        }
      }

      const cron = 'cron' in body ? body.cron : automation.cron;
      const enabled = 'enabled' in body ? body.enabled : automation.enabled;
      if ('cron' in body || 'enabled' in body) {
        const next = cron && enabled ? nextRun(cron) : null;
        patch.next_run_at = next ? next.toISOString() : null;
      }

      const [updated] = await db.update<Automation>('automations', `id=eq.${id}`, patch);
      return json(updated);
    }
  }

  // --- kill switch ---

  if (path === '/kill' && req.method === 'POST') {
    await db.update('automations', 'enabled=eq.true', {
      enabled: false,
      status: 'disabled',
      next_run_at: null,
    });
    log.warn('kill switch pulled', { by: owner });
    // Anything mid-flight to TikTok is left alone: it has already been handed
    // over, and reconcile still needs to settle it.
    return json({ ok: true });
  }

  // --- artifacts (the review queue) ---

  const artifactMatch = path.match(/^\/artifacts\/([0-9a-f-]{36})$/);
  if (artifactMatch && req.method === 'PATCH') {
    const id = artifactMatch[1]!;
    const body = await parseBody(req, updateArtifactSchema);

    const current = await db.selectOne<{ status: string; stages: Record<string, unknown> }>(
      'artifacts',
      `id=eq.${id}&select=status,stages`,
    );
    if (!current) return json({ error: 'not found' }, 404);

    const patch: Record<string, unknown> = {};
    for (const field of
      ['caption', 'hook', 'script', 'shot_notes', 'hashtags', 'video_url', 'account_id', 'scheduled_for'] as const) {
      if (field in body) patch[field] = body[field];
    }

    if (body.status) {
      const allowed = ARTIFACT_TRANSITIONS[current.status] ?? [];
      if (!allowed.includes(body.status)) {
        return json({ error: `cannot move ${current.status} -> ${body.status}` }, 400);
      }
      patch.status = body.status;
      if (body.status === 'draft') patch.error = null;

      // Keep the pipeline record in step with the review decision.
      if (body.status === 'approved') {
        patch.stage = 'schedule';
        patch.stages = { ...current.stages, review: { state: 'done', at: new Date().toISOString() } };
      } else if (body.status === 'draft') {
        patch.stage = 'concept';
        patch.stages = { ...current.stages, review: { state: 'pending' } };
      } else if (body.status === 'rejected') {
        patch.stages = { ...current.stages, review: { state: 'skipped', at: new Date().toISOString() } };
      }
    }

    const [updated] = await db.update('artifacts', `id=eq.${id}`, patch);
    return json(updated);
  }

  // --- tiktok accounts ---

  if (path === '/tiktok/accounts' && req.method === 'POST') {
    const body = await parseBody(req, createAccountSchema);
    const account = await db.insert<{ id: string }>('tiktok_accounts', {
      handle: body.handle,
      app_id: body.app_id ?? null,
      daily_post_limit: body.daily_post_limit,
    });
    return json(account, 201);
  }

  const accountMatch = path.match(/^\/tiktok\/accounts\/([0-9a-f-]{36})$/);
  if (accountMatch && req.method === 'PATCH') {
    const body = await parseBody(req, updateAccountSchema);
    const [updated] = await db.update('tiktok_accounts', `id=eq.${accountMatch[1]!}`, body);
    if (!updated) return json({ error: 'not found' }, 404);
    // Never echo the token columns back to the browser.
    const { access_token_enc: _a, refresh_token_enc: _r, ...safe } = updated as Record<string, unknown>;
    return json(safe);
  }

  const connectMatch = path.match(/^\/tiktok\/accounts\/([0-9a-f-]{36})\/connect$/);
  if (connectMatch && req.method === 'GET') {
    const state = await signState(
      { account_id: connectMatch[1]!, exp: Date.now() + 10 * 60 * 1000 },
      env.TOKEN_ENCRYPTION_KEY,
    );
    return json({ url: authorizeUrl(env, state) });
  }

  return json({ error: 'not found' }, 404);
}

/** Wraps handleApi so validation failures become 400s rather than 500s. */
export async function handleApiSafe(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  try {
    return await handleApi(req, env, ctx);
  } catch (err) {
    if (err instanceof ValidationError) {
      return json({ error: err.message, issues: err.issues }, 400);
    }
    log.error('api error', { path: new URL(req.url).pathname, ...errorFields(err) });
    return json({ error: err instanceof Error ? err.message : 'internal error' }, 500);
  }
}
