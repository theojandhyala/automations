import { Db } from '../lib/db';
import { nextRun } from '../lib/cron';
import { claimOne, executeRun } from '../lib/runner';
import { listHandlers } from '../automations/registry';
import { stageStatuses } from '../lib/pipeline';
import { ownerFromRequest, signState, verifyState } from '../lib/auth';
import { accessTokenFor, authorizeUrl, creatorInfo, exchangeCode, storeTokens } from '../lib/tiktok';
import { log, errorFields } from '../lib/log';
import { decrypt, encrypt } from '../lib/crypto';
import {
  AppStoreApiError,
  appStoreRequest,
  createCustomSubscriptionCode,
  listAppStoreApps,
  listAppSubscriptions,
  listSubscriptionOffers,
  type AppStoreCredentials,
} from '../lib/app-store';
import { publicMediaUrl, uploadMedia } from '../lib/storage';
import { produceOne } from '../automations/tiktok-produce';
import { featureSpecs, getCreativePlaybook } from '../lib/creative-playbooks';
import {
  ValidationError,
  appStoreCredentialsSchema,
  appStoreCustomCodeConfirmSchema,
  appStoreCustomCodePreviewSchema,
  createAccountSchema,
  createAutomationSchema,
  parseBody,
  pexelsKeySchema,
  promotionMissionSchema,
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

interface AppleOfferCodeRequest {
  id: string;
  status: 'pending_confirmation' | 'creating' | 'succeeded' | 'failed';
  apple_app_id: string;
  app_name: string;
  subscription_id: string;
  subscription_name: string;
  offer_code_id: string;
  offer_name: string;
  custom_code: string;
  redemption_limit: number;
  expiration_date: string | null;
  apple_resource_id: string | null;
  redemption_url: string | null;
  error: string | null;
  created_at: string;
  confirmed_at: string | null;
  completed_at: string | null;
}

interface PromotionMission {
  id: string;
  app_id: string;
  account_id: string | null;
  draft_run_id: string | null;
  producer_run_id: string | null;
  status: 'queued' | 'drafting' | 'producing' | 'awaiting_review' | 'failed';
  goal: string;
  audience: string;
  angle: string;
  content_format: 'photo_carousel' | 'video_brief';
  draft_count: number;
  feature_rotation: string[];
  auto_produce: boolean;
  readiness: Record<string, unknown>;
  error: string | null;
  created_at: string;
  completed_at: string | null;
}

interface PromotionApp {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  accent: string;
  promotion_enabled: boolean;
}

async function promotionReadiness(db: Db, env: Env) {
  const [apps, accounts, automations, pexels, featureAssets, drafts] = await Promise.all([
    db.select<PromotionApp>('apps', 'promotion_enabled=eq.true&select=id,slug,name,tagline,accent,promotion_enabled&order=sort_order.asc'),
    db.select<Pick<TikTokAccount, 'id' | 'handle' | 'display_name' | 'app_id' | 'status'>>(
      'tiktok_accounts',
      'select=id,handle,display_name,app_id,status&order=created_at.asc',
    ),
    db.select<Automation>(
      'automations',
      'handler_key=in.(tiktok.generate,tiktok.produce,tiktok.publish)&select=*',
    ),
    db.selectOne<{ provider: string }>('integration_secrets', 'provider=eq.pexels&select=provider'),
    db.select<{ app_slug: string; asset_key: string; mime_type: string }>('creative_assets', 'app_slug=in.(deadset,cast)&select=app_slug,asset_key,mime_type'),
    db.select<{ app_id: string | null }>('artifacts', 'status=eq.draft&select=app_id&limit=500'),
  ]);
  const publishAgent = automations.find((automation) => automation.handler_key === 'tiktok.publish');
  return {
    free_ai: Boolean(env.AI),
    review_required: true,
    feature_libraries: Object.fromEntries(apps.flatMap((app) => {
      const playbook = getCreativePlaybook(app.slug);
      if (!playbook) return [];
      const uploaded = new Set(featureAssets
        .filter((asset) => asset.app_slug === app.slug && ['image/png', 'image/jpeg', 'image/webp'].includes(asset.mime_type))
        .map((asset) => asset.asset_key));
      return [[app.slug, featureSpecs(playbook).map((feature) => ({ ...feature, uploaded: uploaded.has(feature.key) }))]];
    })),
    accounts: accounts.map((account) => ({
      id: account.id,
      handle: account.handle,
      display_name: account.display_name,
      app_id: account.app_id,
      status: account.status,
    })),
    apps: apps.flatMap((app) => {
      const playbook = getCreativePlaybook(app.slug);
      if (!playbook) return [];
      const draftAgent = automations.find(
        (automation) => automation.handler_key === 'tiktok.generate' && automation.app_id === app.id,
      );
      const producerAgent = automations.find(
        (automation) => automation.handler_key === 'tiktok.produce' && automation.app_id === app.id,
      );
      const appAccounts = accounts.filter((account) => account.app_id === app.id);
      const connectedAccount = appAccounts.some((account) => account.status === 'connected');
      const uploadedKeys = new Set(featureAssets
        .filter((asset) => asset.app_slug === app.slug && ['image/png', 'image/jpeg', 'image/webp'].includes(asset.mime_type))
        .map((asset) => asset.asset_key));
      const requiredCount = Object.keys(playbook.features).length;
      const draftAvailable = Boolean(draftAgent && draftAgent.status !== 'disabled');
      const producerAvailable = Boolean(producerAgent && producerAgent.status !== 'disabled');
      const rendererAvailable = true;
      const productionReady = producerAvailable
        && Boolean(pexels)
        && uploadedKeys.size === requiredCount
        && rendererAvailable;
      const blockers: string[] = [];
      if (!draftAgent) blockers.push('No drafting agent exists for this app.');
      else if (!draftAvailable) blockers.push('The drafting agent is disabled.');
      if (!producerAgent) blockers.push(`No carousel production agent exists for ${app.name}.`);
      if (!pexels) blockers.push('Connect the free Pexels photo source.');
      if (uploadedKeys.size < requiredCount) {
        blockers.push(`Upload ${requiredCount - uploadedKeys.size} remaining exact ${app.name} screen(s).`);
      }
      if (!connectedAccount) blockers.push('No connected TikTok publishing account for this app.');
      return {
        ...app,
        draft_agent_id: draftAgent?.id ?? null,
        producer_agent_id: producerAgent?.id ?? null,
        publish_agent_id: publishAgent?.id ?? null,
        playbook_version: playbook.version,
        content_domain: playbook.category,
        uploaded_feature_keys: [...uploadedKeys],
        uploaded_feature_count: uploadedKeys.size,
        feature_count: requiredCount,
        photo_source_ready: Boolean(pexels),
        producer_available: producerAvailable,
        renderer_available: rendererAvailable,
        renderer_mode: 'browser_free_reused_session',
        intelligence_mode: 'performance_learning_with_verified_fallbacks',
        drafting_ready: draftAvailable,
        production_ready: productionReady,
        publishing_ready: Boolean(publishAgent && publishAgent.status !== 'disabled' && connectedAccount),
        pending_drafts: drafts.filter((draft) => draft.app_id === app.id).length,
        blockers,
      };
    }),
  };
}

async function promotionOutputState(db: Db, draftRunId: string, expected: number) {
  const artifacts = await db.select<Pick<Artifact, 'id' | 'photo_urls' | 'error'>>(
    'artifacts',
    `run_id=eq.${draftRunId}&media_type=eq.photo&select=id,photo_urls,error&order=created_at.asc`,
  );
  const rendered = artifacts.filter((artifact) => artifact.photo_urls.length >= 2).length;
  return {
    rendered,
    expected,
    complete: rendered >= expected,
    last_error: artifacts.find((artifact) => artifact.error)?.error ?? null,
  };
}

async function loadAppStoreCredentials(db: Db, env: Env): Promise<AppStoreCredentials | null> {
  const row = await db.selectOne<{ secret_enc: string }>(
    'integration_secrets',
    'provider=eq.app_store_connect&select=secret_enc',
  );
  if (!row) return null;
  return JSON.parse(await decrypt(row.secret_enc, env.TOKEN_ENCRYPTION_KEY)) as AppStoreCredentials;
}

function appStoreFailure(error: unknown): Response {
  if (error instanceof AppStoreApiError) {
    const status = error.status === 401 || error.status === 403 ? 400 : error.status >= 500 ? 502 : 400;
    return json({ error: `Apple rejected the request: ${error.message}` }, status);
  }
  return json({ error: error instanceof Error ? error.message : 'App Store Connect request failed.' }, 400);
}

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

  if (path === '/tiktok/status' && req.method === 'GET') {
    return json({
      developer_app_configured: Boolean(
        env.TIKTOK_CLIENT_KEY && env.TIKTOK_CLIENT_SECRET && env.TIKTOK_REDIRECT_URI,
      ),
      redirect_uri: env.TIKTOK_REDIRECT_URI ?? null,
      scopes: ['user.info.basic', 'video.publish', 'video.upload'],
      owner_review_required: true,
    });
  }

  // The honest pipeline view: which stages actually work in this deployment.
  if (path === '/pipeline' && req.method === 'GET') {
    return json({ stages: stageStatuses(env) });
  }

  // --- creative production studio ---

  if (path === '/creative-studio' && req.method === 'GET') {
    const appSlug = url.searchParams.get('app_slug') ?? 'deadset';
    const playbook = getCreativePlaybook(appSlug);
    if (!playbook) return json({ error: 'That app does not have an active creative playbook.' }, 404);
    const app = await db.selectOne<PromotionApp>('apps', `slug=eq.${encodeURIComponent(appSlug)}&select=id,slug,name,tagline,accent,promotion_enabled`);
    if (!app?.promotion_enabled) return json({ error: 'Promotion is paused for that app.' }, 409);
    const [secret, assets, producer] = await Promise.all([
      db.selectOne<{ provider: string }>('integration_secrets', 'provider=eq.pexels&select=provider'),
      db.select<Record<string, unknown>>('creative_assets', `app_slug=eq.${encodeURIComponent(appSlug)}&select=*&order=asset_key.asc`),
      db.selectOne<Automation>('automations', `app_id=eq.${app.id}&handler_key=eq.tiktok.produce&select=*`),
    ]);
    return json({
      app: { id: app.id, slug: app.slug, name: app.name, accent: app.accent },
      playbook: {
        version: playbook.version,
        positioning: playbook.positioning,
        claims_to_avoid: playbook.claimsToAvoid,
        caption_suffix: playbook.captionSuffix,
      },
      pexels: { configured: Boolean(secret) },
      producer: producer ? {
        id: producer.id,
        status: producer.status,
        enabled: producer.enabled,
        last_run_at: producer.last_run_at,
        current_task: producer.current_task,
      } : null,
      features: assets.map((asset) => ({
        ...asset,
        public_url: publicMediaUrl(env, String(asset.storage_path)),
      })),
      required_features: featureSpecs(playbook),
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

  // --- remote App Store operations ---

  if (path === '/app-store/status' && req.method === 'GET') {
    const [secret, requests] = await Promise.all([
      db.selectOne<{ provider: string }>(
        'integration_secrets',
        'provider=eq.app_store_connect&select=provider',
      ),
      db.select<AppleOfferCodeRequest>(
        'apple_offer_code_requests',
        'select=id,status,apple_app_id,app_name,subscription_id,subscription_name,offer_code_id,offer_name,custom_code,redemption_limit,expiration_date,apple_resource_id,redemption_url,error,created_at,confirmed_at,completed_at&order=created_at.desc&limit=20',
      ),
    ]);
    return json({ configured: Boolean(secret), requests });
  }

  if (path === '/integrations/app-store' && req.method === 'PUT') {
    const body = await parseBody(req, appStoreCredentialsSchema);
    try {
      // A read-only request verifies all three credential parts before storage.
      const apps = await listAppStoreApps(body);
      await db.upsert('integration_secrets', {
        provider: 'app_store_connect',
        secret_enc: await encrypt(JSON.stringify(body), env.TOKEN_ENCRYPTION_KEY),
        updated_at: new Date().toISOString(),
      }, 'provider');
      return json({ configured: true, app_count: apps.length, key_id: body.key_id });
    } catch (error) {
      return appStoreFailure(error);
    }
  }

  if (path === '/app-store/catalog' && req.method === 'GET') {
    const credentials = await loadAppStoreCredentials(db, env);
    if (!credentials) return json({ error: 'Connect App Store Connect first.' }, 409);
    try {
      const appId = url.searchParams.get('app_id');
      const subscriptionId = url.searchParams.get('subscription_id');
      if (subscriptionId) {
        return json({ offers: await listSubscriptionOffers(credentials, subscriptionId) });
      }
      if (appId) {
        return json(await listAppSubscriptions(credentials, appId));
      }
      return json({ apps: await listAppStoreApps(credentials) });
    } catch (error) {
      return appStoreFailure(error);
    }
  }

  if (path === '/app-store/custom-codes/preview' && req.method === 'POST') {
    const body = await parseBody(req, appStoreCustomCodePreviewSchema);
    const credentials = await loadAppStoreCredentials(db, env);
    if (!credentials) return json({ error: 'Connect App Store Connect first.' }, 409);
    if (body.expiration_date) {
      const expiration = new Date(`${body.expiration_date}T00:00:00Z`);
      const sixMonths = new Date();
      sixMonths.setUTCMonth(sixMonths.getUTCMonth() + 6);
      if (expiration <= new Date() || expiration > sixMonths) {
        return json({ error: 'Expiration must be in the future and no more than six months away.' }, 400);
      }
    }
    try {
      // Confirm that this offer still exists and is readable before creating an
      // auditable pending request. This endpoint never creates an Apple code.
      await appStoreRequest(credentials, `/v1/subscriptionOfferCodes/${encodeURIComponent(body.offer_code_id)}`);
      const created = await db.insert<AppleOfferCodeRequest>('apple_offer_code_requests', {
        status: 'pending_confirmation',
        apple_app_id: body.apple_app_id,
        app_name: body.app_name,
        subscription_id: body.subscription_id,
        subscription_name: body.subscription_name,
        offer_code_id: body.offer_code_id,
        offer_name: body.offer_name,
        custom_code: body.custom_code,
        redemption_limit: body.redemption_limit,
        expiration_date: body.expiration_date,
        created_by: owner,
      });
      return json(created, 201);
    } catch (error) {
      return appStoreFailure(error);
    }
  }

  const appleConfirmMatch = path.match(/^\/app-store\/custom-codes\/([0-9a-f-]{36})\/confirm$/);
  if (appleConfirmMatch && req.method === 'POST') {
    await parseBody(req, appStoreCustomCodeConfirmSchema);
    const credentials = await loadAppStoreCredentials(db, env);
    if (!credentials) return json({ error: 'Connect App Store Connect first.' }, 409);
    const requestId = appleConfirmMatch[1]!;
    const current = await db.selectOne<AppleOfferCodeRequest>(
      'apple_offer_code_requests',
      `id=eq.${requestId}&select=*`,
    );
    if (!current) return json({ error: 'Offer-code request not found.' }, 404);
    if (current.status !== 'pending_confirmation') {
      return json({ error: `This request is already ${current.status}.` }, 409);
    }
    const now = new Date().toISOString();
    const claimed = await db.update<AppleOfferCodeRequest>(
      'apple_offer_code_requests',
      `id=eq.${requestId}&status=eq.pending_confirmation`,
      { status: 'creating', confirmed_at: now, error: null },
    );
    if (!claimed[0]) return json({ error: 'This request was already confirmed elsewhere.' }, 409);
    try {
      const result = await createCustomSubscriptionCode(credentials, {
        offerCodeId: current.offer_code_id,
        customCode: current.custom_code,
        numberOfCodes: current.redemption_limit,
        expirationDate: current.expiration_date,
      });
      const redemptionUrl = `https://apps.apple.com/redeem?ctx=offercodes&id=${encodeURIComponent(current.apple_app_id)}&code=${encodeURIComponent(result.custom_code)}`;
      const [completed] = await db.update<AppleOfferCodeRequest>(
        'apple_offer_code_requests',
        `id=eq.${requestId}`,
        {
          status: 'succeeded',
          apple_resource_id: result.id,
          custom_code: result.custom_code,
          redemption_limit: result.redemption_limit,
          expiration_date: result.expiration_date,
          redemption_url: redemptionUrl,
          completed_at: new Date().toISOString(),
        },
      );
      log.info('Apple offer code created', {
        request_id: requestId,
        app_id: current.apple_app_id,
        offer_code_id: current.offer_code_id,
        redemption_limit: current.redemption_limit,
        by: owner,
      });
      return json(completed);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'App Store Connect request failed.';
      await db.update(
        'apple_offer_code_requests',
        `id=eq.${requestId}`,
        { status: 'failed', error: message, completed_at: new Date().toISOString() },
      ).catch(() => undefined);
      return appStoreFailure(error);
    }
  }

  if (path === '/creative-assets' && req.method === 'POST') {
    const form = await req.formData();
    const appSlug = String(form.get('app_slug') ?? 'deadset');
    const assetKey = String(form.get('asset_key') ?? '');
    const file = form.get('file');
    const playbook = getCreativePlaybook(appSlug);
    if (!playbook) return json({ error: 'unknown or inactive app promotion workspace' }, 400);
    if (!(assetKey in playbook.features)) return json({ error: `unknown ${playbook.appName} feature key` }, 400);
    if (!(file instanceof File)) return json({ error: 'image file is required' }, 400);
    const allowed = new Set(['image/png', 'image/jpeg', 'image/webp']);
    if (!allowed.has(file.type)) return json({ error: 'upload PNG, JPEG or WebP only' }, 400);
    if (file.size <= 0 || file.size > 10 * 1024 * 1024) return json({ error: 'image must be 10 MB or smaller' }, 400);

    const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const storagePath = `features/${appSlug}/${assetKey}/${crypto.randomUUID()}.${extension}`;
    await uploadMedia(env, storagePath, await file.arrayBuffer(), file.type);
    const asset = await db.upsert<Record<string, unknown>>('creative_assets', {
      app_slug: appSlug,
      asset_key: assetKey,
      label: playbook.features[assetKey]!.label,
      storage_path: storagePath,
      mime_type: file.type,
      source_kind: 'owner_upload',
      source_url: null,
      licence_note: `Exact current ${playbook.appName} app capture uploaded by the owner.`,
      updated_at: new Date().toISOString(),
    }, 'app_slug,asset_key');
    return json({ ...asset, public_url: publicMediaUrl(env, storagePath) }, 201);
  }

  // --- guided app-promotion missions ---

  if (path === '/promotion/readiness' && req.method === 'GET') {
    return json(await promotionReadiness(db, env));
  }

  if (path === '/promotion/missions' && req.method === 'GET') {
    const missions = await db.select<PromotionMission>(
      'promotion_missions',
      'select=*&order=created_at.desc&limit=20',
    );
    const runIds = missions.flatMap((mission) => mission.draft_run_id ? [mission.draft_run_id] : []);
    const renderedArtifacts = runIds.length
      ? await db.select<Pick<Artifact, 'run_id' | 'photo_urls'>>(
          'artifacts',
          `run_id=in.(${runIds.join(',')})&media_type=eq.photo&select=run_id,photo_urls`,
        )
      : [];
    const renderedByRun = new Map<string, number>();
    for (const artifact of renderedArtifacts) {
      if (artifact.run_id && artifact.photo_urls.length >= 2) {
        renderedByRun.set(artifact.run_id, (renderedByRun.get(artifact.run_id) ?? 0) + 1);
      }
    }
    return json({ missions: missions.map((mission) => {
      const rendered = mission.draft_run_id ? renderedByRun.get(mission.draft_run_id) ?? 0 : 0;
      return {
        ...mission,
        rendered_count: rendered,
        render_complete: mission.content_format !== 'photo_carousel' || rendered >= mission.draft_count,
      };
    }) });
  }

  const retryMissionMatch = path.match(/^\/promotion\/missions\/([0-9a-f-]{36})\/retry-production$/);
  if (retryMissionMatch && req.method === 'POST') {
    const mission = await db.selectOne<PromotionMission>(
      'promotion_missions',
      `id=eq.${retryMissionMatch[1]!}&select=*`,
    );
    if (!mission) return json({ error: 'Promotion mission not found.' }, 404);
    if (mission.content_format !== 'photo_carousel' || !mission.draft_run_id) {
      return json({ error: 'This mission has no carousel draft run to produce.' }, 409);
    }
    const draftRunId = mission.draft_run_id;

    const readiness = await promotionReadiness(db, env);
    const app = readiness.apps.find((candidate) => candidate.id === mission.app_id);
    if (!app?.producer_agent_id || !app.production_ready) {
      return json({ error: app?.blockers[0] ?? 'Carousel production is not ready.' }, 409);
    }
    let producer = await db.selectOne<Automation>('automations', `id=eq.${app.producer_agent_id}&select=*`);
    if (!producer) return json({ error: 'Carousel production agent not found.' }, 404);

    // A Worker eviction can leave a production run claimed. Only release it
    // after a clear quiet period; a fresh run is never interrupted.
    const staleAt = Date.now() - 90_000;
    if (producer.status === 'running' && producer.running_since && Date.parse(producer.running_since) < staleAt) {
      if (producer.last_run_at) {
        const openRun = await db.selectOne<{ id: string }>(
          'runs',
          `automation_id=eq.${producer.id}&status=eq.running&order=started_at.desc&limit=1&select=id`,
        );
        if (openRun) {
          await db.update('runs', `id=eq.${openRun.id}`, {
            status: 'failed',
            error: 'Recovered after the previous production execution window ended.',
            finished_at: new Date().toISOString(),
          });
        }
      }
      await db.update('automations', `id=eq.${producer.id}`, {
        status: 'idle',
        running_since: null,
        current_task: null,
      });
      producer = { ...producer, status: 'idle', running_since: null, current_task: null };
    }

    const claimed = await claimOne(env, producer.id);
    if (!claimed) return json({ error: 'The production agent is still working. Try again shortly.' }, 409);
    await db.update('promotion_missions', `id=eq.${mission.id}`, { status: 'producing', error: null });
    ctx.waitUntil((async () => {
      try {
        const producerRun = await executeRun(env, {
          ...claimed,
          config: validateConfig('tiktok.produce', {
            ...claimed.config,
            app_slug: app.slug,
            max_per_run: Math.min(mission.draft_count, 6),
            source_run_id: draftRunId,
          }),
        }, 'manual');
        const output = await promotionOutputState(db, draftRunId, mission.draft_count);
        const complete = producerRun.status === 'succeeded' && output.complete;
        await db.update('promotion_missions', `id=eq.${mission.id}`, {
          producer_run_id: producerRun.runId,
          status: complete ? 'awaiting_review' : 'failed',
          error: complete
            ? null
            : output.last_error ?? `${output.rendered}/${output.expected} carousels rendered. Retry the exact outputs to continue.`,
          completed_at: new Date().toISOString(),
        });
      } catch (error) {
        log.error('promotion production recovery failed', { mission_id: mission.id, ...errorFields(error) });
        await db.update('promotion_missions', `id=eq.${mission.id}`, {
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
          completed_at: new Date().toISOString(),
        }).catch(() => undefined);
      }
    })());
    return json({ ok: true, mission_id: mission.id }, 202);
  }

  if (path === '/promotion/missions' && req.method === 'POST') {
    const body = await parseBody(req, promotionMissionSchema);
    const readiness = await promotionReadiness(db, env);
    const app = readiness.apps.find((candidate) => candidate.slug === body.app_slug);
    if (!app) return json({ error: 'App workspace not found or promotion is paused.' }, 404);
    const playbook = getCreativePlaybook(app.slug);
    if (!playbook) return json({ error: 'No verified creative playbook exists for this app.' }, 409);
    if (!app.drafting_ready || !app.draft_agent_id) {
      return json({ error: app.blockers[0] ?? 'Drafting is not ready for this app.' }, 409);
    }
    if (body.account_id) {
      const account = readiness.accounts.find((candidate) => candidate.id === body.account_id);
      if (!account) return json({ error: 'TikTok account not found.' }, 404);
      if (account.status !== 'connected') return json({ error: 'Choose a connected TikTok account.' }, 409);
      if (account.app_id && account.app_id !== app.id) {
        return json({ error: 'That TikTok account belongs to a different app workspace.' }, 400);
      }
    }

    const defaultFeatures = Object.keys(playbook.features);
    const featureRotation = body.content_format === 'photo_carousel'
      ? body.feature_rotation.length ? body.feature_rotation : defaultFeatures
      : [];
    const invalidFeature = featureRotation.find((feature) => !(feature in playbook.features));
    if (invalidFeature) return json({ error: `“${invalidFeature}” is not a verified ${playbook.appName} feature.` }, 400);
    const selectedFeaturesReady = featureRotation.every((feature) => app.uploaded_feature_keys.includes(feature));
    const selectedProductionReady = Boolean(app.producer_available && app.photo_source_ready && selectedFeaturesReady);
    const mission = await db.insert<PromotionMission>('promotion_missions', {
      app_id: app.id,
      account_id: body.account_id,
      status: 'queued',
      goal: body.goal,
      audience: body.audience,
      angle: body.angle,
      content_format: body.content_format,
      draft_count: body.draft_count,
      feature_rotation: featureRotation,
      auto_produce: body.auto_produce,
      readiness: {
        drafting_ready: app.drafting_ready,
        production_ready: selectedProductionReady,
        playbook_version: playbook.version,
        selected_features_ready: selectedFeaturesReady,
        publishing_ready: app.publishing_ready,
        blockers: app.blockers,
      },
      created_by: owner,
    });

    const claimed = await claimOne(env, app.draft_agent_id);
    if (!claimed) {
      await db.update('promotion_missions', `id=eq.${mission.id}`, {
        status: 'failed',
        error: 'The drafting agent is already working. Try again after its current mission finishes.',
        completed_at: new Date().toISOString(),
      });
      return json({ error: 'The drafting agent is already working. Try again shortly.' }, 409);
    }

    const goalLabels = {
        downloads: 'earn qualified App Store visits without sounding promotional',
        feature_discovery: 'make one exact app feature feel useful and memorable',
        trust: 'build credibility through specific, supportable product proof',
        engagement: 'start a relatable conversation that naturally reveals the app',
    } as const;
    const audienceLabels: Record<string, string> = {
        new_lifters: 'new lifters who want less confusion',
        consistent_lifters: 'people already training consistently who want a clearer record',
        serious_gym: 'serious gym users who care about progression and detail',
        general_fitness: 'general fitness users who want a simpler routine',
        new_anglers: 'new anglers who want simpler field decisions',
        weekend_anglers: 'weekend anglers deciding when and where to fish',
        serious_anglers: 'serious anglers who care about conditions, evidence and records',
        local_crews: 'local fishing friends who plan and log sessions together',
    };
    const angleLabels = app.content_domain === 'fishing'
      ? {
          relatable: 'relatable fishing thought, field decision or confession',
          problem_solution: 'one concrete angling frustration followed by exact app proof',
          proof: 'show the product resolving the fishing hook with no unsupported claims',
          routine: 'ordinary fishing preparation or session where the app is the natural next action',
        } as const
      : {
          relatable: 'relatable gym thought or confession',
          problem_solution: 'one concrete training frustration followed by exact app proof',
          proof: 'show the product resolving the training hook with no unsupported claims',
          routine: 'ordinary workout routine where the app is the natural next action',
        } as const;
    const extraContext = [
      `Mission goal: ${goalLabels[body.goal]}.`,
      `Audience: ${audienceLabels[body.audience] ?? body.audience}.`,
      `Creative angle: ${angleLabels[body.angle]}.`,
      'One draft must make one promise to one audience and prove it with one relevant product feature.',
      'The hook must be clear in one second and feel like native TikTok content before it feels commercial.',
      'Use only genuine app capabilities, real or licensed source media, and no fabricated transformations, results, users, or statistics.',
      'The final media must remain in owner review; do not imply it has been approved or published.',
    ].join(' ');
    const overrideConfig = validateConfig('tiktok.generate', {
      ...claimed.config,
      app_slug: app.slug,
      count: body.draft_count,
      account_id: body.account_id,
      extra_context: extraContext,
      content_format: body.content_format === 'photo_carousel' ? 'photo_carousel' : 'video',
      creative_brief: {
        goal: body.goal,
        audience: body.audience,
        angle: body.angle,
        hypothesis: `${angleLabels[body.angle]} for ${audienceLabels[body.audience] ?? body.audience} will ${goalLabels[body.goal]}`,
      },
      ...(body.content_format === 'photo_carousel'
        ? { source_policy: 'licensed_real_only', feature_rotation: featureRotation }
        : {}),
    });

    ctx.waitUntil((async () => {
      try {
        await db.update('promotion_missions', `id=eq.${mission.id}`, {
          status: 'drafting',
          started_at: new Date().toISOString(),
        });
        const draftRun = await executeRun(env, { ...claimed, config: overrideConfig }, 'manual');
        if (draftRun.status === 'failed') {
          await db.update('promotion_missions', `id=eq.${mission.id}`, {
            status: 'failed',
            draft_run_id: draftRun.runId,
            error: 'Drafting failed. Open the run log for the exact reason.',
            completed_at: new Date().toISOString(),
          });
          return;
        }
        await db.update('promotion_missions', `id=eq.${mission.id}`, { draft_run_id: draftRun.runId });

        const shouldProduce = body.auto_produce
          && body.content_format === 'photo_carousel'
          && selectedProductionReady
          && app.producer_agent_id;
        if (shouldProduce) {
          const producer = await claimOne(env, app.producer_agent_id!);
          if (producer) {
            await db.update('promotion_missions', `id=eq.${mission.id}`, { status: 'producing' });
            const producerRun = await executeRun(env, {
              ...producer,
              config: validateConfig('tiktok.produce', {
                ...producer.config,
                app_slug: app.slug,
                max_per_run: Math.min(body.draft_count, 6),
                source_run_id: draftRun.runId,
              }),
            }, 'chain');
            const output = await promotionOutputState(db, draftRun.runId, body.draft_count);
            const complete = producerRun.status === 'succeeded' && output.complete;
            await db.update('promotion_missions', `id=eq.${mission.id}`, {
              producer_run_id: producerRun.runId,
              status: complete ? 'awaiting_review' : 'failed',
              error: complete
                ? null
                : output.last_error ?? `${output.rendered}/${output.expected} carousels rendered. Retry the exact outputs to continue.`,
              completed_at: new Date().toISOString(),
            });
            return;
          }
        }
        await db.update('promotion_missions', `id=eq.${mission.id}`, {
          status: 'awaiting_review',
          completed_at: new Date().toISOString(),
        });
      } catch (error) {
        log.error('promotion mission failed', { mission_id: mission.id, ...errorFields(error) });
        await db.update('promotion_missions', `id=eq.${mission.id}`, {
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
          completed_at: new Date().toISOString(),
        }).catch(() => undefined);
      }
    })());
    return json(mission, 202);
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

    let selectedAccount: TikTokAccount | null = null;
    if (body.account_id) {
      selectedAccount = await db.selectOne<TikTokAccount>(
        'tiktok_accounts',
        `id=eq.${body.account_id}&select=*`,
      );
      if (!selectedAccount) return json({ error: 'TikTok account not found' }, 404);
      if (selectedAccount.status !== 'connected') return json({ error: 'That TikTok account is not connected.' }, 409);
      if (selectedAccount.app_id && selectedAccount.app_id !== current.app_id) {
        return json({ error: 'That TikTok account belongs to a different app workspace.' }, 400);
      }
    }

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
        const publishingAccount = selectedAccount ?? await db.selectOne<TikTokAccount>(
          'tiktok_accounts',
          `id=eq.${accountId}&select=*`,
        );
        if (!publishingAccount || publishingAccount.status !== 'connected') {
          return json({ error: 'choose a connected TikTok account before approval' }, 400);
        }
        if (publishingAccount.app_id && publishingAccount.app_id !== current.app_id) {
          return json({ error: 'The selected TikTok account belongs to a different app workspace.' }, 400);
        }
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
