import { Db } from '../lib/db';
import { isValidCron, nextRun } from '../lib/cron';
import { executeRun } from '../lib/runner';
import { listHandlers } from '../automations/registry';
import { ownerFromRequest, signState, verifyState } from '../lib/auth';
import { authorizeUrl, exchangeCode, storeTokens } from '../lib/tiktok';
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
      return Response.redirect(`${url.origin}/accounts?connected=1`, 302);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await db.update('tiktok_accounts', `id=eq.${payload.account_id}`, { status: 'error' });
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

  // --- automations ---

  if (path === '/automations' && req.method === 'POST') {
    const body = (await req.json()) as Partial<Automation>;
    if (!body.handler_key || !body.name) return json({ error: 'handler_key and name are required' }, 400);
    if (body.cron && !isValidCron(body.cron)) return json({ error: `invalid cron: ${body.cron}` }, 400);

    const next = body.cron && body.enabled ? nextRun(body.cron) : null;
    const created = await db.insert<Automation>('automations', {
      handler_key: body.handler_key,
      name: body.name,
      description: body.description ?? null,
      app_id: body.app_id ?? null,
      cron: body.cron ?? null,
      enabled: body.enabled ?? false,
      config: body.config ?? {},
      next_run_at: next ? next.toISOString() : null,
    });
    return json(created, 201);
  }

  const automationMatch = path.match(/^\/automations\/([0-9a-f-]{36})(\/run)?$/);
  if (automationMatch) {
    const id = automationMatch[1]!;
    const automation = await db.selectOne<Automation>('automations', `id=eq.${id}&select=*`);
    if (!automation) return json({ error: 'not found' }, 404);

    // Manual trigger. The run happens after the response so the dashboard gets
    // its run id immediately and can start streaming logs.
    if (automationMatch[2] && req.method === 'POST') {
      if (automation.status === 'running') return json({ error: 'already running' }, 409);
      ctx.waitUntil(
        executeRun(env, automation, 'manual').catch((err) =>
          console.error('manual run failed', err),
        ),
      );
      return json({ ok: true, automation_id: id }, 202);
    }

    if (req.method === 'PATCH') {
      const body = (await req.json()) as Partial<Automation>;
      const patch: Record<string, unknown> = {};

      for (const field of ['name', 'description', 'config', 'app_id'] as const) {
        if (field in body) patch[field] = body[field];
      }

      if ('cron' in body) {
        if (body.cron && !isValidCron(body.cron)) return json({ error: `invalid cron: ${body.cron}` }, 400);
        patch.cron = body.cron ?? null;
      }

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
    // Anything mid-flight to TikTok is left alone: it has already been handed
    // over, and reconcile still needs to settle it.
    return json({ ok: true });
  }

  // --- artifacts (the review queue) ---

  const artifactMatch = path.match(/^\/artifacts\/([0-9a-f-]{36})$/);
  if (artifactMatch && req.method === 'PATCH') {
    const id = artifactMatch[1]!;
    const body = (await req.json()) as {
      status?: string;
      caption?: string;
      hook?: string;
      hashtags?: string[];
      video_url?: string;
      account_id?: string;
      scheduled_for?: string | null;
    };

    const current = await db.selectOne<{ status: string }>('artifacts', `id=eq.${id}&select=status`);
    if (!current) return json({ error: 'not found' }, 404);

    const patch: Record<string, unknown> = {};
    for (const field of ['caption', 'hook', 'hashtags', 'video_url', 'account_id', 'scheduled_for'] as const) {
      if (field in body) patch[field] = body[field];
    }

    if (body.status) {
      const allowed = ARTIFACT_TRANSITIONS[current.status] ?? [];
      if (!allowed.includes(body.status)) {
        return json({ error: `cannot move ${current.status} -> ${body.status}` }, 400);
      }
      patch.status = body.status;
      if (body.status === 'draft') patch.error = null;
    }

    const [updated] = await db.update('artifacts', `id=eq.${id}`, patch);
    return json(updated);
  }

  // --- tiktok accounts ---

  if (path === '/tiktok/accounts' && req.method === 'POST') {
    const body = (await req.json()) as { handle?: string; app_id?: string; daily_post_limit?: number };
    if (!body.handle) return json({ error: 'handle is required' }, 400);
    const account = await db.insert<{ id: string }>('tiktok_accounts', {
      handle: body.handle.replace(/^@/, ''),
      app_id: body.app_id ?? null,
      daily_post_limit: body.daily_post_limit ?? 2,
    });
    return json(account, 201);
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
