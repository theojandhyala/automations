/** A visual review is evidence, not a model-generated text score or owner consent. */
export const NATIVE_VISUAL_STANDARD = 'native-photo-2026-09-10';

export function nativeVisualReviewBlocker(input: {
  hook: string | null; caption: string | null; photoUrls?: string[];
  assetManifest?: Record<string, unknown>;
}): string | null {
  const urls = input.photoUrls;
  // Planning and rendering may proceed. Release requires the exact finished media.
  if (!urls?.length) return null;
  const manifest = input.assetManifest ?? {};
  if (manifest.app_slug !== 'deadset' && manifest.app_slug !== 'cast') return null;
  const raw = manifest.native_visual_review;
  const review = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const reviewedUrls = review.photo_urls;
  const matches = Array.isArray(reviewedUrls) && reviewedUrls.length === urls.length
    && urls.every((url, i) => reviewedUrls[i] === url);
  if (review.standard !== NATIVE_VISUAL_STANDARD || review.result !== 'pass'
      || !['agent', 'owner'].includes(String(review.reviewer))
      || typeof review.checked_at !== 'string' || !Number.isFinite(Date.parse(review.checked_at))
      || review.hook !== input.hook || review.caption !== input.caption
      || !matches || review.full_frame !== true || review.native_photo !== true
      || review.truth_and_rights !== true || review.all_slides_inspected !== true
      || typeof review.notes !== 'string' || review.notes.trim().length < 20) {
    return 'Exact final slides need the current native-photo visual review: full frame, natural photography, readable copy, truthful proof and recorded rights. Text quality alone is not release approval.';
  }
  if (manifest.requires_owner_review === true) return 'This creative remains on an explicit review hold.';
  return null;
}
