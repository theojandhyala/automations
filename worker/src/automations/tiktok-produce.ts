import { decrypt } from '../lib/crypto';
import { publicMediaUrl, uploadMedia } from '../lib/storage';
import { searchPexels, type PexelsPhoto } from '../lib/pexels';
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

interface ManifestSlide {
  role?: string;
  overlay?: string;
  asset_query?: string;
  app_asset_key?: string;
}

interface CarouselManifest extends Record<string, unknown> {
  slides?: ManifestSlide[];
  feature?: string;
}

export interface ProductionResult {
  state: 'produced' | 'blocked';
  reason?: string;
  photo_urls?: string[];
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function slideHtml(imageUrl: string, overlay: string, role: 'hook' | 'feature'): string {
  const fontSize = role === 'hook'
    ? overlay.length > 80 ? 68 : overlay.length > 52 ? 78 : 90
    : overlay.length > 60 ? 54 : 64;
  const imageFit = role === 'hook' ? 'cover' : 'contain';
  const position = role === 'hook' ? 'center 43%' : 'center center';
  const overlayPosition = role === 'hook'
    ? 'top: 27%; left: 70px; right: 70px;'
    : 'bottom: 150px; left: 64px; right: 64px;';
  const shade = role === 'hook'
    ? '<div class="shade"></div>'
    : '<div class="feature-shade"></div>';

  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
*{box-sizing:border-box}html,body{margin:0;width:1080px;height:1920px;overflow:hidden;background:#06070a}
body{font-family:Arial,Helvetica,sans-serif;color:#fff}
.photo{position:absolute;inset:0;width:100%;height:100%;object-fit:${imageFit};object-position:${position};background:#06070a}
.shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.18),rgba(0,0,0,.05) 46%,rgba(0,0,0,.24))}
.feature-shade{position:absolute;inset:0;background:linear-gradient(180deg,transparent 66%,rgba(0,0,0,.35))}
.copy{position:absolute;${overlayPosition}text-align:center;font-size:${fontSize}px;font-weight:900;line-height:1.08;letter-spacing:-2px;color:#fff;
 text-shadow:-4px -4px 0 #000,4px -4px 0 #000,-4px 4px 0 #000,4px 4px 0 #000,0 6px 12px rgba(0,0,0,.55);overflow-wrap:anywhere}
</style></head><body><img class="photo" src="${escapeHtml(imageUrl)}">${shade}<div class="copy">${escapeHtml(overlay)}</div></body></html>`;
}

async function renderSlide(
  env: Env,
  imageUrl: string,
  overlay: string,
  role: 'hook' | 'feature',
): Promise<Uint8Array> {
  const response = await env.BROWSER.quickAction('screenshot', {
    html: slideHtml(imageUrl, overlay, role),
    viewport: { width: 1080, height: 1920, deviceScaleFactor: 1 },
    screenshotOptions: { type: 'jpeg', quality: 92 },
    gotoOptions: { waitUntil: 'networkidle0', timeout: 30_000 },
  });
  if (!response.ok) {
    throw new Error(`Cloudflare slide render failed (${response.status}): ${(await response.text()).slice(0, 300)}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

function choosePhoto(photos: PexelsPhoto[], artifactId: string): PexelsPhoto | null {
  if (photos.length === 0) return null;
  const seed = [...artifactId].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return photos[seed % photos.length] ?? null;
}

async function providerKey(env: Env, db: Db): Promise<string | null> {
  const secret = await db.selectOne<IntegrationSecret>(
    'integration_secrets',
    'provider=eq.pexels&select=secret_enc',
  );
  return secret ? decrypt(secret.secret_enc, env.TOKEN_ENCRYPTION_KEY) : null;
}

async function preflightArtifact(env: Env, db: Db, artifact: Artifact): Promise<string | null> {
  const manifest = artifact.asset_manifest as CarouselManifest;
  const slides = Array.isArray(manifest.slides) ? manifest.slides : [];
  const featureSlide = slides.find((slide) => slide.role === 'feature_proof') ?? slides[1];
  const featureKey = featureSlide?.app_asset_key ?? (typeof manifest.feature === 'string' ? manifest.feature : null);
  if (!featureKey) return 'Draft does not name an exact Deadset feature screen.';
  const [feature, key] = await Promise.all([
    db.selectOne<{ id: string }>(
      'creative_assets',
      `app_slug=eq.deadset&asset_key=eq.${encodeURIComponent(featureKey)}&select=id`,
    ),
    providerKey(env, db),
  ]);
  if (!feature) return `Upload the exact Deadset “${featureKey}” screen in Creative studio.`;
  if (!key) return 'Connect a free Pexels API key in Creative studio.';
  return null;
}

export async function produceArtifact(
  env: Env,
  db: Db,
  artifact: Artifact,
): Promise<ProductionResult> {
  const manifest = artifact.asset_manifest as CarouselManifest;
  const slides = Array.isArray(manifest.slides) ? manifest.slides : [];
  const hookSlide = slides.find((slide) => slide.role === 'hook') ?? slides[0];
  const featureSlide = slides.find((slide) => slide.role === 'feature_proof') ?? slides[1];
  if (!hookSlide || !featureSlide) return { state: 'blocked', reason: 'Draft has no two-slide asset manifest.' };

  const featureKey = featureSlide.app_asset_key ?? (typeof manifest.feature === 'string' ? manifest.feature : null);
  if (!featureKey) return { state: 'blocked', reason: 'Draft does not name an exact Deadset feature screen.' };

  const feature = await db.selectOne<CreativeAsset>(
    'creative_assets',
    `app_slug=eq.deadset&asset_key=eq.${encodeURIComponent(featureKey)}&select=*`,
  );
  if (!feature) {
    return { state: 'blocked', reason: `Upload the exact Deadset “${featureKey}” screen in Creative studio.` };
  }

  const key = await providerKey(env, db);
  if (!key) return { state: 'blocked', reason: 'Connect a free Pexels API key in Creative studio.' };

  const query = hookSlide.asset_query?.trim() || 'candid gym mirror workout phone photo';
  const stock = choosePhoto(await searchPexels(key, query), artifact.id);
  if (!stock) return { state: 'blocked', reason: `No licensed portrait photo found for “${query}”.` };

  const hookBytes = await renderSlide(env, stock.src.original, hookSlide.overlay ?? artifact.hook ?? '', 'hook');
  const featureUrl = publicMediaUrl(env, feature.storage_path);
  const featureBytes = await renderSlide(env, featureUrl, featureSlide.overlay ?? '', 'feature');
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
    photo_urls: photoUrls,
    stage: 'review',
    stages: {
      ...artifact.stages,
      assets: { state: 'done', at: now, note: `Licensed Pexels photo ${stock.id} + owner-uploaded ${featureKey}` },
      edit: { state: 'done', at: now, note: 'Rendered as two 1080×1920 JPEG slides' },
      review: { state: 'pending' },
    },
    asset_manifest: {
      ...manifest,
      production: {
        rendered_at: now,
        dimensions: { width: 1080, height: 1920 },
        output_format: 'image/jpeg',
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
  const blocker = await preflightArtifact(env, db, artifact);
  if (blocker) return { state: 'blocked', reason: blocker };
  return produceArtifact(env, db, artifact);
}

export const produceCarousels: Handler = {
  key: 'tiktok.produce',
  name: 'Build TikTok carousels',
  description: 'Finds licensed real photos, renders them with exact app screens, and hosts final slides.',
  async run(ctx) {
    const config = ctx.automation.config as { app_slug?: string; max_per_run?: number };
    const appSlug = config.app_slug ?? 'deadset';
    const maxPerRun = Math.min(Math.max(config.max_per_run ?? 2, 1), 5);
    const app = await ctx.db.selectOne<{ id: string }>('apps', `slug=eq.${encodeURIComponent(appSlug)}&select=id`);
    if (!app) throw new Error(`no app with slug "${appSlug}"`);

    const candidates = await ctx.db.select<Artifact>(
      'artifacts',
      `app_id=eq.${app.id}&status=eq.draft&media_type=eq.photo&select=*&order=created_at.asc&limit=30`,
    );
    const pending = candidates.filter((artifact) => artifact.photo_urls.length === 0).slice(0, maxPerRun);
    if (pending.length === 0) return { produced: 0, blocked: 0, message: 'No unrendered photo drafts.' };

    await ctx.setTask(`building ${pending.length} Deadset carousel${pending.length === 1 ? '' : 's'}`);
    let produced = 0;
    const blocked: Array<{ id: string; reason: string }> = [];
    const ready: Artifact[] = [];
    for (const artifact of pending) {
      const reason = await preflightArtifact(ctx.env, ctx.db, artifact);
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

    for (const artifact of ready) {
      try {
        const result = await produceArtifact(ctx.env, ctx.db, artifact);
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
    return { produced, blocked: blocked.length, blockers: blocked };
  },
};
