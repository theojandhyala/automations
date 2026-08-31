import { decrypt } from '../lib/crypto';
import { publicMediaUrl, uploadMedia } from '../lib/storage';
import { searchPexels, type PexelsPhoto } from '../lib/pexels';
import { getCreativePlaybook } from '../lib/creative-playbooks';
import { renderCarouselSlides } from '../lib/slide-renderer';
import type { Db } from '../lib/db';
import type { Artifact, Env } from '../types';
import type { Handler } from './registry';

interface IntegrationSecret {
  secret_enc: string;
}

interface CreativeAsset {
  id: string;
  app_slug: string;
  asset_key: string;
  label: string;
  storage_path: string;
  mime_type: string;
}

interface PromotionMissionLink {
  id: string;
  draft_run_id: string;
  draft_count: number;
}

interface ManifestSlide {
  role?: string;
  overlay?: string;
  asset_query?: string;
  app_asset_key?: string;
}

interface CarouselManifest extends Record<string, unknown> {
  slides?: ManifestSlide[];
  feature?: string;
  app_slug?: string;
}

export interface ProductionResult {
  state: 'produced' | 'blocked';
  reason?: string;
  photo_urls?: string[];
}

function choosePhoto(photos: PexelsPhoto[], artifactId: string, category: 'fitness' | 'fishing'): PexelsPhoto | null {
  if (photos.length === 0) return null;
  const categoryTerms = category === 'fitness'
    ? ['gym', 'fitness', 'workout', 'weight', 'barbell', 'lifter', 'athlete', 'exercise', 'training']
    : ['fish', 'fishing', 'angler', 'lake', 'river', 'sea', 'coast', 'rod', 'catch'];
  const relevant = photos.filter((photo) => {
    const alt = photo.alt.toLowerCase();
    return categoryTerms.some((term) => alt.includes(term));
  });
  // Pexels orders by relevance. Prefer results whose alt text confirms the app
  // category, then vary only among the first six strong matches.
  const pool = (relevant.length ? relevant : photos).slice(0, 6);
  const seed = [...artifactId].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return pool[seed % pool.length] ?? null;
}

function renderedHook(artifactHook: string | null, plannedOverlay: string | undefined): string {
  const preferred = artifactHook?.trim() ?? '';
  const words = preferred.match(/[\p{L}\p{N}]+/gu) ?? [];
  return preferred.length >= 8 && words.length >= 2
    ? preferred
    : plannedOverlay?.trim() || 'One detail I check before the next session';
}

async function providerKey(env: Env, db: Db): Promise<string | null> {
  const secret = await db.selectOne<IntegrationSecret>(
    'integration_secrets',
    'provider=eq.pexels&select=secret_enc',
  );
  return secret ? decrypt(secret.secret_enc, env.TOKEN_ENCRYPTION_KEY) : null;
}

async function syncMissionOutput(db: Db, mission: PromotionMissionLink): Promise<void> {
  const artifacts = await db.select<Pick<Artifact, 'photo_urls' | 'error'>>(
    'artifacts',
    `run_id=eq.${mission.draft_run_id}&media_type=eq.photo&select=photo_urls,error`,
  );
  const rendered = artifacts.filter((artifact) => artifact.photo_urls.length >= 2).length;
  const complete = rendered >= mission.draft_count;
  await db.update('promotion_missions', `id=eq.${mission.id}`, {
    status: complete ? 'awaiting_review' : 'failed',
    error: complete
      ? null
      : artifacts.find((artifact) => artifact.error)?.error
        ?? `${rendered}/${mission.draft_count} carousels rendered. The scheduled producer will resume this exact batch.`,
    ...(complete ? { completed_at: new Date().toISOString() } : {}),
  });
}

async function preflightArtifact(env: Env, db: Db, artifact: Artifact, appSlug: string): Promise<string | null> {
  const manifest = artifact.asset_manifest as CarouselManifest;
  const playbook = getCreativePlaybook(appSlug);
  if (!playbook) return 'This app has no verified carousel production playbook.';
  const slides = Array.isArray(manifest.slides) ? manifest.slides : [];
  const featureSlide = slides.find((slide) => slide.role === 'feature_proof') ?? slides[1];
  const featureKey = featureSlide?.app_asset_key ?? (typeof manifest.feature === 'string' ? manifest.feature : null);
  if (!featureKey || !(featureKey in playbook.features)) return `Draft does not name a verified ${playbook.appName} feature screen.`;
  const [feature, key] = await Promise.all([
    db.selectOne<{ id: string; mime_type: string }>(
      'creative_assets',
      `app_slug=eq.${encodeURIComponent(appSlug)}&asset_key=eq.${encodeURIComponent(featureKey)}&select=id,mime_type`,
    ),
    providerKey(env, db),
  ]);
  if (!feature) return `Upload the exact ${playbook.appName} “${featureKey}” screen in Creative studio.`;
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(feature.mime_type)) {
    return `Replace the ${playbook.appName} “${featureKey}” screen with PNG, JPEG or WebP.`;
  }
  if (!key) return 'Connect a free Pexels API key in Creative studio.';
  return null;
}

export async function produceArtifact(
  env: Env,
  db: Db,
  artifact: Artifact,
  appSlug: string,
): Promise<ProductionResult> {
  const manifest = artifact.asset_manifest as CarouselManifest;
  const playbook = getCreativePlaybook(appSlug);
  if (!playbook) return { state: 'blocked', reason: 'This app has no verified production playbook.' };
  const slides = Array.isArray(manifest.slides) ? manifest.slides : [];
  const hookSlide = slides.find((slide) => slide.role === 'hook') ?? slides[0];
  const featureSlide = slides.find((slide) => slide.role === 'feature_proof') ?? slides[1];
  if (!hookSlide || !featureSlide) return { state: 'blocked', reason: 'Draft has no two-slide asset manifest.' };

  const featureKey = featureSlide.app_asset_key ?? (typeof manifest.feature === 'string' ? manifest.feature : null);
  if (!featureKey || !(featureKey in playbook.features)) {
    return { state: 'blocked', reason: `Draft does not name a verified ${playbook.appName} feature screen.` };
  }

  const feature = await db.selectOne<CreativeAsset>(
    'creative_assets',
    `app_slug=eq.${encodeURIComponent(appSlug)}&asset_key=eq.${encodeURIComponent(featureKey)}&select=*`,
  );
  if (!feature) {
    return { state: 'blocked', reason: `Upload the exact ${playbook.appName} “${featureKey}” screen in Creative studio.` };
  }
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(feature.mime_type)) {
    return { state: 'blocked', reason: `Replace the ${playbook.appName} “${featureKey}” screen with PNG, JPEG or WebP.` };
  }

  const key = await providerKey(env, db);
  if (!key) return { state: 'blocked', reason: 'Connect a free Pexels API key in Creative studio.' };

  // The verified feature playbook owns the visual search. Model-authored asset
  // queries remain in old manifests for traceability but cannot steer sourcing.
  const query = playbook.features[featureKey]!.stockDirection;
  const stock = choosePhoto(await searchPexels(key, query), artifact.id, playbook.category);
  if (!stock) return { state: 'blocked', reason: `No licensed portrait photo found for “${query}”.` };
  const hookOverlay = renderedHook(artifact.hook, hookSlide.overlay);
  const featureOverlay = playbook.features[featureKey]!.fallbackProofOverlay;

  const [hookBytes, featureBytes] = await renderCarouselSlides(
    env,
    {
      imageUrl: stock.src.portrait,
      overlay: hookOverlay,
      role: 'hook',
    },
    {
      imageUrl: publicMediaUrl(env, feature.storage_path),
      // Re-apply the current verified payoff at render time so older queued
      // drafts also benefit from updated truth and legibility rules.
      overlay: featureOverlay,
      role: 'feature',
    },
  );
  const nonce = crypto.randomUUID();
  const hookPath = `outputs/${artifact.id}/slide-1-${nonce}.jpg`;
  const featurePath = `outputs/${artifact.id}/slide-2-${nonce}.jpg`;
  await Promise.all([
    uploadMedia(env, hookPath, hookBytes, 'image/jpeg'),
    uploadMedia(env, featurePath, featureBytes, 'image/jpeg'),
  ]);

  const now = new Date().toISOString();
  const photoUrls = [publicMediaUrl(env, hookPath), publicMediaUrl(env, featurePath)];
  await db.update('artifacts', `id=eq.${artifact.id}`, {
    hook: hookOverlay,
    photo_urls: photoUrls,
    error: null,
    stage: 'review',
    stages: {
      ...artifact.stages,
      assets: { state: 'done', at: now, note: `Licensed Pexels photo ${stock.id} + owner-uploaded ${featureKey}` },
      edit: { state: 'done', at: now, note: 'Rendered in one reusable session as two 1080×1920 JPEG slides' },
      review: { state: 'pending' },
    },
    asset_manifest: {
      ...manifest,
      slides: [
        { ...hookSlide, overlay: hookOverlay, asset_query: query },
        { ...featureSlide, overlay: featureOverlay, app_asset_key: featureKey },
      ],
      production: {
        rendered_at: now,
        dimensions: { width: 1080, height: 1920 },
        output_format: 'image/jpeg',
        renderer: 'cloudflare_browser_reused_session',
        stock: {
          provider: 'pexels',
          id: stock.id,
          source_url: stock.url,
          photographer: stock.photographer,
          photographer_url: stock.photographer_url,
          licence_url: 'https://www.pexels.com/license/',
          alt: stock.alt,
        },
        feature_asset: {
          id: feature.id,
          key: feature.asset_key,
          app_slug: appSlug,
          source_kind: 'owner_upload',
        },
      },
    },
  });
  return { state: 'produced', photo_urls: photoUrls };
}

export async function produceOne(
  env: Env,
  db: Db,
  artifact: Artifact,
): Promise<ProductionResult> {
  const manifest = artifact.asset_manifest as CarouselManifest;
  // Older produced drafts pre-date the manifest app key and are all Deadset.
  const appSlug = typeof manifest.app_slug === 'string' ? manifest.app_slug : 'deadset';
  const blocker = await preflightArtifact(env, db, artifact, appSlug);
  if (blocker) return { state: 'blocked', reason: blocker };
  return produceArtifact(env, db, artifact, appSlug);
}

export const produceCarousels: Handler = {
  key: 'tiktok.produce',
  name: 'Build TikTok carousels',
  description: 'Finds licensed real photos, renders them with exact app screens, and hosts final slides.',
  async run(ctx) {
    const config = ctx.automation.config as { app_slug?: string; max_per_run?: number; source_run_id?: string };
    const appSlug = config.app_slug ?? 'deadset';
    const playbook = getCreativePlaybook(appSlug);
    if (!playbook) throw new Error(`no verified production playbook for "${appSlug}"`);
    const maxPerRun = Math.min(Math.max(config.max_per_run ?? 3, 1), 6);
    const app = await ctx.db.selectOne<{ id: string }>('apps', `slug=eq.${encodeURIComponent(appSlug)}&select=id`);
    if (!app) throw new Error(`no app with slug "${appSlug}"`);

    const activeMission = config.source_run_id
      ? null
      : await ctx.db.selectOne<PromotionMissionLink>(
          'promotion_missions',
          `app_id=eq.${app.id}&auto_produce=eq.true&content_format=eq.photo_carousel&draft_run_id=not.is.null&status=in.(failed,producing,awaiting_review)&select=id,draft_run_id,draft_count&order=created_at.desc&limit=1`,
        );
    const sourceRunId = config.source_run_id ?? activeMission?.draft_run_id;

    const candidates = await ctx.db.select<Artifact>(
      'artifacts',
      [
        `app_id=eq.${app.id}`,
        'status=eq.draft',
        'media_type=eq.photo',
        sourceRunId ? `run_id=eq.${encodeURIComponent(sourceRunId)}` : null,
        'select=*',
        'order=created_at.asc',
        'limit=30',
      ].filter(Boolean).join('&'),
    );
    const pending = candidates.filter((artifact) => artifact.photo_urls.length === 0).slice(0, maxPerRun);
    if (pending.length === 0) {
      if (activeMission) await syncMissionOutput(ctx.db, activeMission);
      return { produced: 0, blocked: 0, message: 'No unrendered photo drafts.' };
    }

    await ctx.setTask(`building ${pending.length} ${playbook.appName} carousel${pending.length === 1 ? '' : 's'}`);
    let produced = 0;
    const blocked: Array<{ id: string; reason: string }> = [];
    const ready: Artifact[] = [];
    for (const artifact of pending) {
      const reason = await preflightArtifact(ctx.env, ctx.db, artifact, appSlug);
      if (reason) {
        blocked.push({ id: artifact.id, reason });
        ctx.log('warn', 'carousel blocked', { artifact_id: artifact.id, reason });
        await ctx.db.update('artifacts', `id=eq.${artifact.id}`, {
          error: reason,
          stage: 'assets',
          stages: { ...artifact.stages, assets: { state: 'blocked', note: reason } },
        });
      } else {
        ready.push(artifact);
      }
    }
    if (ready.length === 0) return { produced, blocked: blocked.length, blockers: blocked };

    // Sequential artifacts reconnect to the same idle browser session, avoiding
    // the free plan's one-new-browser-per-20-seconds burst limit.
    for (const artifact of ready) {
      try {
        const result = await produceArtifact(ctx.env, ctx.db, artifact, appSlug);
        if (result.state === 'produced') {
          produced += 1;
          ctx.log('info', 'carousel produced', { artifact_id: artifact.id });
        } else {
          blocked.push({ id: artifact.id, reason: result.reason ?? 'blocked' });
          ctx.log('warn', 'carousel blocked', { artifact_id: artifact.id, reason: result.reason });
          await ctx.db.update('artifacts', `id=eq.${artifact.id}`, {
            error: result.reason,
            stage: 'assets',
            stages: { ...artifact.stages, assets: { state: 'blocked', note: result.reason } },
          });
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        blocked.push({ id: artifact.id, reason });
        ctx.log('error', 'carousel production failed', { artifact_id: artifact.id, reason });
        await ctx.db.update('artifacts', `id=eq.${artifact.id}`, {
          error: reason,
          stage: 'assets',
          stages: { ...artifact.stages, assets: { state: 'failed', note: reason } },
        });
      }
    }
    if (activeMission) await syncMissionOutput(ctx.db, activeMission);
    return { produced, blocked: blocked.length, blockers: blocked };
  },
};
