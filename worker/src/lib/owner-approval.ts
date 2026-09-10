import type { Artifact } from '../types';
// Owner opted both active brands into quality-gated autonomous release on 2026-09-10.
export function automaticCreativeApprovalAllowed(appSlug: string): boolean { return appSlug === 'cast' || appSlug === 'deadset'; }
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)]));
  return value;
}
/** Server-generated receipt binds a human decision to exact content and destination. */
export async function ownerApprovalReceipt(artifact: Artifact): Promise<string> {
  const fields = ['id', 'app_id', 'account_id', 'hook', 'caption', 'hashtags', 'script', 'shot_notes',
    'video_url', 'photo_urls', 'media_type', 'asset_manifest', 'tiktok_privacy_level',
    'disable_comment', 'auto_add_music', 'brand_organic_toggle', 'brand_content_toggle', 'is_aigc'] as const;
  const payload = Object.fromEntries(fields.map(key => [key, artifact[key] ?? null]));
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(canonical(payload))));
  return 'owner-approved:v1:' + Array.from(new Uint8Array(hash), n => n.toString(16).padStart(2, '0')).join('');
}
export async function hasExactOwnerApproval(artifact: Artifact): Promise<boolean> {
  const review = artifact.stages?.review;
  return review?.state === 'done' && Boolean(review.at) && review.note === await ownerApprovalReceipt(artifact);
}
