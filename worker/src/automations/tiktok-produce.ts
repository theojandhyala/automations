import { decrypt } from '../lib/crypto';
import { publicMediaUrl, uploadMedia } from '../lib/storage';
import { searchPexels, type PexelsPhoto } from '../lib/pexels';
import { getCreativePlaybook } from '../lib/creative-playbooks';
import { assessCreativeQuality } from '../lib/creative-quality';
import { unattendedPublishingEnabled } from '../lib/tiktok';
import {
  CAPTION_RENDERER_VERSION,
  closeSlideRenderer,
  openSlideRenderer,
  renderCarouselSlides,
  type SlideRendererSession,
} from '../lib/slide-renderer';
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
  content_lane?: { id?: string };
}

export interface ProductionResult {
  state: 'produced' | 'blocked';
  reason?: string;
  photo_urls?: string[];
}

export function choosePhoto(
  photos: PexelsPhoto[],
  artifactId: string,
  category: 'fitness' | 'fishing',
  requiredAltTermGroups: string[][] = [],
): PexelsPhoto | null {
  if (photos.length === 0) return null;
  const categoryTerms = category === 'fitness'
    ? ['gym', 'fitness', 'workout', 'weight', 'barbell', 'lifter', 'athlete', 'exercise', 'training']
    : ['fish', 'fishing', 'angler', 'lake', 'river', 'sea', 'coast', 'rod', 'catch'];
  const templateMatches = requiredAltTermGroups.length
    ? photos.filter((photo) => {
        const alt = photo.alt.toLowerCase();
        return requiredAltTermGroups.every((group) => group.some((term) => alt.includes(term)));
      })
    : [];
  if (requiredAltTermGroups.length && templateMatches.length === 0) return null;
  const relevant = photos.filter((photo) => {
    const alt = photo.alt.toLowerCase();
    return categoryTerms.some((term) => alt.includes(term));
  });
  // Pexels orders by relevance. Prefer results whose alt text confirms the app
  // category, then vary only among the first six strong matches.
  const pool = (templateMatches.length ? templateMatches : relevant.length ? relevant : photos).slice(0, 6);
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

async function syncMissionOutput(
  db: Db,
  mission: PromotionMissionLink,
  producerRunId: string,
): Promise<void> {
  const artifacts = await db.select<Pick<Artifact, 'photo_urls' | 'error'>>(
    'artifacts',
    `run_id=eq.${mission.draft_run_id}&media_type=eq.photo&select=photo_urls,error`,
  );
  const rendered = artifacts.filter((artifact) => artifact.photo_urls.length >= 2).length;
  const complete = rendered >= mission.draft_count;
  await db.update('promotion_missions', `id=eq.${mission.id}`, {
    producer_run_id: producerRunId,
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
  const contentLaneId = manifest.content_lane?.id ?? playbook.creativeStrategy.defaultLane;
  const contentLane = playbook.creativeStrategy.lanes[contentLaneId];
  if (!contentLane) return `Draft does not name a verified ${playbook.appName} content lane.`;
  if (contentLane.featureKey && contentLane.featureKey !== featureKey) {
    return `${contentLane.label} must use the verified ${contentLane.featureKey} proof screen.`;
  }
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
  renderer?: SlideRendererSession,
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
  const contentLaneId = manifest.content_lane?.id ?? playbook.creativeStrategy.defaultLane;
  const contentLane = playbook.creativeStrategy.lanes[contentLaneId];
  if (!contentLane) {
    return { state: 'blocked', reason: `Draft does not name a verified ${playbook.appName} content lane.` };
  }
  if (contentLane.featureKey && contentLane.featureKey !== featureKey) {
    return { state: 'blocked', reason: `${contentLane.label} must use the verified ${contentLane.featureKey} proof screen.` };
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
  const hookVisualTemplate = playbook.hookVisualTemplate;
  const query = hookVisualTemplate?.searchQuery ?? playbook.features[featureKey]!.stockDirection;
  const stock = choosePhoto(
    await searchPexels(key, query),
    artifact.id,
    playbook.category,
    hookVisualTemplate?.requiredAltTermGroups,
  );
  if (!stock) {
    return {
      state: 'blocked',
      reason: hookVisualTemplate
        ? `No licensed portrait photo passed the required “${hookVisualTemplate.id}” ${hookVisualTemplate.gateLabel} visual gate.`
        : `No licensed portrait photo found for “${query}”.`,
    };
  }
  const hookOverlay = renderedHook(artifact.hook, hookSlide.overlay);
  const featureOverlay = contentLane.proofOverlay ?? playbook.features[featureKey]!.fallbackProofOverlay;

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
    renderer,
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
  const unattended = unattendedPublishingEnabled(env) && Boolean(artifact.account_id);
  await db.update('artifacts', `id=eq.${artifact.id}`, {
    status: unattended ? 'approved' : 'draft',
    hook: hookOverlay,
    photo_urls: photoUrls,
    error: null,
    stage: unattended ? 'schedule' : 'review',
    ...(unattended ? {
      tiktok_privacy_level: 'PUBLIC_TO_EVERYONE',
      disable_comment: false,
      auto_add_music: true,
      brand_organic_toggle: true,
      brand_content_toggle: false,
      posting_consent_at: null,
    } : {}),
    stages: {
      ...artifact.stages,
      assets: {
        state: 'done',
        at: now,
        note: `Licensed Pexels photo ${stock.id}${hookVisualTemplate ? ` passed ${hookVisualTemplate.id}` : ''} + owner-uploaded ${featureKey}`,
      },
      edit: { state: 'done', at: now, note: 'Rendered in one bounded paid session as two 1080×1920 JPEG slides' },
      review: unattended
        ? { state: 'done', at: now, note: 'Autonomous quality and truth gates passed for the owned account.' }
        : { state: 'pending' },
      ...(unattended ? {
        schedule: { state: 'pending', at: now, note: 'Queued for the next 12:00, 15:00 or 18:00 Europe/London slot.' },
      } : {}),
    },
    asset_manifest: {
      ...manifest,
      app_slug: appSlug,
      caption_treatment: playbook.creativeStrategy.captionTreatment,
      ...(hookVisualTemplate
        ? {
            hook_visual_template: {
              id: hookVisualTemplate.id,
              direction: hookVisualTemplate.direction,
              caption_style: hookVisualTemplate.captionStyle,
            },
          }
        : {}),
      slides: [
        { ...hookSlide, overlay: hookOverlay, asset_query: query },
        { ...featureSlide, overlay: featureOverlay, app_asset_key: featureKey },
      ],
      production: {
        rendered_at: now,
        dimensions: { width: 1080, height: 1920 },
        output_format: 'image/jpeg',
        renderer: 'cloudflare_browser_paid_bounded_session',
        caption_renderer: CAPTION_RENDERER_VERSION,
        jpeg_quality: 94,
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
  if (!artifact.app_id) return { state: 'blocked', reason: 'This draft is not assigned to an app mission.' };
  const app = await db.selectOne<{ slug: string; promotion_enabled: boolean }>(
    'apps',
    `id=eq.${artifact.app_id}&select=slug,promotion_enabled`,
  );
  if (!app?.promotion_enabled || !getCreativePlaybook(app.slug)) {
    return { state: 'blocked', reason: 'This app does not have an active, verified production playbook.' };
  }
  if (typeof manifest.app_slug === 'string' && manifest.app_slug !== app.slug) {
    return { state: 'blocked', reason: `Draft content belongs to ${manifest.app_slug}, not ${app.slug}.` };
  }
  const appSlug = app.slug;
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
          // Retry requests move a failed mission back to `producing` first.
          // Completed and failed missions must never starve the scheduled queue.
          `app_id=eq.${app.id}&auto_produce=eq.true&content_format=eq.photo_carousel&draft_run_id=not.is.null&status=eq.producing&select=id,draft_run_id,draft_count&order=created_at.desc&limit=1`,
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
    let autoApproved = 0;
    if (unattendedPublishingEnabled(ctx.env)) {
      const renderedDrafts = candidates
        .filter((artifact) => artifact.account_id && artifact.photo_urls.length >= 1 && artifact.photo_urls.length <= 35)
        .slice(0, maxPerRun);
      for (const artifact of renderedDrafts) {
        const quality = assessCreativeQuality({
          hook: artifact.hook,
          caption: artifact.caption,
          hashtags: artifact.hashtags,
          mediaType: artifact.media_type,
          assetManifest: artifact.asset_manifest,
          photoUrls: artifact.photo_urls,
        });
        if (!quality.pass) continue;
        const approvedAt = new Date().toISOString();
        await ctx.db.update('artifacts', `id=eq.${artifact.id}`, {
          status: 'approved',
          stage: 'schedule',
          tiktok_privacy_level: 'PUBLIC_TO_EVERYONE',
          disable_comment: false,
          auto_add_music: true,
          brand_organic_toggle: true,
          brand_content_toggle: false,
          posting_consent_at: null,
          stages: {
            ...artifact.stages,
            review: { state: 'done', at: approvedAt, note: 'Autonomous quality and truth gates passed for the owned account.' },
            schedule: { state: 'pending', at: approvedAt, note: 'Queued for the next 12:00, 15:00 or 18:00 Europe/London slot.' },
          },
        });
        autoApproved++;
      }
    }
    const pending = candidates.filter((artifact) => artifact.photo_urls.length === 0).slice(0, maxPerRun);
    if (pending.length === 0) {
      if (activeMission) await syncMissionOutput(ctx.db, activeMission, ctx.runId);
      return { produced: 0, auto_approved: autoApproved, blocked: 0, message: 'No unrendered photo drafts.' };
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

    // One paid Browser Run session owns the entire batch. This avoids launch
    // bursts and then closes immediately so no idle time is billed.
    const renderer = await openSlideRenderer(ctx.env);
    try {
      for (const artifact of ready) {
        try {
          const result = await produceArtifact(ctx.env, ctx.db, artifact, appSlug, renderer);
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
    } finally {
      await closeSlideRenderer(renderer);
    }
    if (activeMission) await syncMissionOutput(ctx.db, activeMission, ctx.runId);
    return { produced, auto_approved: autoApproved, blocked: blocked.length, blockers: blocked };
  },
};
