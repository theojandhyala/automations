import { Db } from '../lib/db';
import { nextRun } from '../lib/cron';
import { claimOne, executeRun } from '../lib/runner';
import { listHandlers } from '../automations/registry';
import { stageStatuses } from '../lib/pipeline';
import { ownerFromRequest, signState, verifyState } from '../lib/auth';
import { accessTokenFor, authorizeUrl, creatorInfo, exchangeCode, storeTokens } from '../lib/tiktok';
import { log, errorFields } from '../lib/log';
import { encrypt } from '../lib/crypto';
import { publicMediaUrl, uploadMedia } from '../lib/storage';
import { produceOne } from '../automations/tiktok-produce';
import {
  ValidationError,
  createAccountSchema,
  createAutomationSchema,
  parseBody,
  pexelsKeySchema,
  updateAccountSchema,
  updateArtifactSchema,
  updateAutomationSchema,
  validateConfig,
} from '../lib/schemas';
import type { Artifact, Automation, Env, TikTokAccount } from '../types';

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

const DEADSET_FEATURES: Record<string, string> = {
  muscle_diagram: 'Muscle diagram',
  training_heatmap: 'Training heatmap',
  pr_wall: 'PR wall',
  progression_board: 'Progression board',
  workout_plan: 'Workout plan',
  live_logger: 'Live workout logger',
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

  // --- creative production studio ---

  if (path === '/creative-studio' && req.method === 'GET') {
    const [secret, assets] = await Promise.all([
      db.selectOne<{ provider: string }>('integration_secrets', 'provider=eq.pexels&select=provider'),
      db.select<Record<string, unknown>>('creative_assets', 'app_slug=eq.deadset&select=*&order=asset_key.asc'),
    ]);
    return json({
      pexels: { configured: Boolean(secret) },
      features: assets.map((asset) => ({
        ...asset,
        public_url: publicMediaUrl(env, String(asset.storage_path)),
      })),
      required_features: Object.entries(DEADSET_FEATURES).map(([key, label]) => ({ key, label })),
    });
  }

  if (path === '/integrations/pexels' && req.method === 'PUT') {
    const body = await parseBody(req, pexelsKeySchema);
    const check = await fetch('https://api.pexels.com/v1/curated?per_page=1', {
      headers: { Authorization: body.api_key },
    });
    if (!check.ok) return json({ error: 'Pexels rejected that API key.' }, 400);
    await db.upsert('integration_secrets', {
      provider: 'pexels',
      secret_enc: await encrypt(body.api_key, env.TOKEN_ENCRYPTION_KEY),
      updated_at: new Date().toISOString(),
    }, 'provider');
    return json({ configured: true });
  }

  if (path === '/creative-assets' && req.method === 'POST') {
    const form = await req.formData();
    const assetKey = String(form.get('asset_key') ?? '');
    const file = form.get('file');
    if (!(assetKey in DEADSET_FEATURES)) return json({ error: 'unknown Deadset feature key' }, 400);
    if (!(file instanceof File)) return json({ error: 'image file is required' }, 400);
    const allowed = new Set(['image/png', 'image/jpeg', 'image/webp']);
    if (!allowed.has(file.type)) return json({ error: 'upload PNG, JPEG or WebP only' }, 400);
    if (file.size <= 0 || file.size > 10 * 1024 * 1024) return json({ error: 'image must be 10 MB or smaller' }, 400);

    const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const storagePath = `features/deadset/${assetKey}/${crypto.randomUUID()}.${extension}`;
    await uploadMedia(env, storagePath, await file.arrayBuffer(), file.type);
    const asset = await db.upsert<Record<string, unknown>>('creative_assets', {
      app_slug: 'deadset',
      asset_key: assetKey,
      label: DEADSET_FEATURES[assetKey],
      storage_path: storagePath,
      mime_type: file.type,
      source_kind: 'owner_upload',
      source_url: null,
      licence_note: 'Exact current Deadset app capture uploaded by the owner.',
      updated_at: new Date().toISOString(),
    }, 'app_slug,asset_key');
    return json({ ...asset, public_url: publicMediaUrl(env, storagePath) }, 201);
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

  const artifactMatch = path.match(/^\/artifacts\/([0-9a-f-]{36})(\/produce)?$/);
  if (artifactMatch?.[2] && req.method === 'POST') {
    const id = artifactMatch[1]!;
    const artifact = await db.selectOne<Artifact>('artifacts', `id=eq.${id}&select=*`);
    if (!artifact) return json({ error: 'not found' }, 404);
    if (artifact.status !== 'draft' || artifact.media_type !== 'photo') {
      return json({ error: 'only draft photo carousels can be produced' }, 400);
    }
    await db.update('artifacts', `id=eq.${id}`, {
      error: null,
      stage: 'assets',
      stages: { ...artifact.stages, assets: { state: 'running', at: new Date().toISOString() } },
    });
    ctx.waitUntil(
      produceOne(env, db, artifact)
        .then(async (result) => {
          if (result.state === 'blocked') {
            await db.update('artifacts', `id=eq.${id}`, {
              error: result.reason,
              stage: 'assets',
              stages: { ...artifact.stages, assets: { state: 'blocked', note: result.reason } },
            });
          }
        })
        .catch(async (err) => {
          const message = err instanceof Error ? err.message : String(err);
          log.error('manual carousel production failed', { artifact_id: id, ...errorFields(err) });
          await db.update('artifacts', `id=eq.${id}`, {
            error: message,
            stage: 'assets',
            stages: { ...artifact.stages, assets: { state: 'failed', note: message } },
          }).catch(() => undefined);
        }),
    );
    return json({ ok: true, artifact_id: id }, 202);
  }

  if (artifactMatch && !artifactMatch[2] && req.method === 'PATCH') {
    const id = artifactMatch[1]!;
    const body = await parseBody(req, updateArtifactSchema);

    const current = await db.selectOne<Artifact>(
      'artifacts',
      `id=eq.${id}&select=*`,
    );
    if (!current) return json({ error: 'not found' }, 404);

    const patch: Record<string, unknown> = {};
    for (const field of
      [
        'caption', 'hook', 'script', 'shot_notes', 'hashtags', 'video_url', 'photo_urls',
        'media_type', 'asset_manifest', 'account_id', 'scheduled_for', 'tiktok_privacy_level',
        'disable_comment', 'auto_add_music', 'brand_organic_toggle', 'brand_content_toggle', 'is_aigc',
      ] as const) {
      if (field in body) patch[field] = body[field];
    }

    if ('posting_consent' in body) {
      patch.posting_consent_at = body.posting_consent ? new Date().toISOString() : null;
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
        const mediaType = body.media_type ?? current.media_type;
        const videoUrl = body.video_url === undefined ? current.video_url : body.video_url;
        const photoUrls = body.photo_urls ?? current.photo_urls;
        const accountId = body.account_id === undefined ? current.account_id : body.account_id;
        const privacy = body.tiktok_privacy_level === undefined
          ? current.tiktok_privacy_level
          : body.tiktok_privacy_level;
        const consented = body.posting_consent === true;
        const ownBrand = body.brand_organic_toggle === undefined
          ? current.brand_organic_toggle
          : body.brand_organic_toggle;
        const mediaReady = mediaType === 'photo'
          ? Array.isArray(photoUrls) && photoUrls.length >= 1 && photoUrls.length <= 35
          : Boolean(videoUrl);

        if (!mediaReady) return json({ error: `${mediaType} media is required before approval` }, 400);
        if (!accountId) return json({ error: 'choose a TikTok account before approval' }, 400);
        if (!privacy) return json({ error: 'choose a privacy level before approval' }, 400);
        if (!ownBrand) return json({ error: 'confirm that this promotes your own brand before approval' }, 400);
        if (!consented) return json({ error: 'explicit TikTok posting consent is required' }, 400);

        patch.posting_consent_at = new Date().toISOString();
        patch.stage = 'schedule';
        patch.stages = { ...current.stages, review: { state: 'done', at: new Date().toISOString() } };
      } else if (body.status === 'draft') {
        patch.stage = 'concept';
        patch.stages = { ...current.stages, review: { state: 'pending' } };
      } else if (body.status === 'rejected') {
        patch.stages = { ...current.stages, review: { state: 'skipped', at: new Date().toISOString() } };
      }
    } else if (current.status === 'approved') {
      const consentSensitive = [
        'caption', 'hook', 'hashtags', 'video_url', 'photo_urls', 'media_type', 'account_id',
        'tiktok_privacy_level', 'disable_comment', 'auto_add_music', 'brand_organic_toggle',
        'brand_content_toggle', 'is_aigc',
      ].some((field) => field in body);
      if (consentSensitive) {
        patch.status = 'draft';
        patch.posting_consent_at = null;
        patch.stage = 'concept';
        patch.stages = { ...current.stages, review: { state: 'pending' } };
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

  const creatorInfoMatch = path.match(/^\/tiktok\/accounts\/([0-9a-f-]{36})\/creator-info$/);
  if (creatorInfoMatch && req.method === 'GET') {
    const account = await db.selectOne<TikTokAccount>(
      'tiktok_accounts',
      `id=eq.${creatorInfoMatch[1]!}&select=*`,
    );
    if (!account) return json({ error: 'account not found' }, 404);
    const token = await accessTokenFor(env, db, account);
    const info = await creatorInfo(token);
    return json({
      creator_username: info.creator_username,
      creator_nickname: info.creator_nickname,
      creator_avatar_url: info.creator_avatar_url ?? null,
      privacy_level_options: info.privacy_level_options,
      comment_disabled: info.comment_disabled,
      duet_disabled: info.duet_disabled,
      stitch_disabled: info.stitch_disabled,
      max_video_post_duration_sec: info.max_video_post_duration_sec,
    });
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
