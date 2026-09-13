import type { Artifact } from '../types';

/** Rebuild only system-owned drafts. Exact reviewed or booked media stays intact. */
export function carouselRenderReason(
  artifact: Artifact, appSlug: string, currentRenderer: string,
): 'unrendered' | 'outdated_renderer' | null {
  if (artifact.status !== 'draft' || artifact.media_type !== 'photo') return null;
  if (artifact.publish_id || artifact.tiktok_post_id || artifact.scheduled_for) return null;
  if (artifact.stages?.delivery || artifact.asset_manifest.requires_owner_review === true) return null;
  const review = artifact.asset_manifest.native_visual_review as { result?: string } | undefined;
  if (review?.result === 'pass' || artifact.stages?.review?.state === 'done') return null;
  const production = artifact.asset_manifest.production as { renderer?: string; caption_renderer?: string } | undefined;
  // Unknown/imported production is never silently replaced, even if its URLs are missing.
  if (production?.renderer && production.renderer !== 'cloudflare_browser_paid_bounded_session') return null;
  if (artifact.photo_urls.length === 0) return 'unrendered';
  const slides = artifact.asset_manifest.slides;
  if (appSlug === 'deadset' && artifact.photo_urls.length === 2
      && Array.isArray(slides) && slides.length === 2
      && production?.renderer === 'cloudflare_browser_paid_bounded_session'
      && production.caption_renderer !== currentRenderer) return 'outdated_renderer';
  return null;
}
