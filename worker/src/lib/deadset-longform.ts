/** Owner reference inspected in docs/deadset-longform-reference-2026-09-12.md. */
export const DEADSET_LONGFORM = 'deadset_rules_carousel';
export const DEADSET_LONGFORM_REFERENCE = 'https://www.tiktok.com/@anoma.yollande23/photo/7684726961444228384';
export const DEADSET_LONGFORM_SLIDES = 10;
export const DEADSET_LONGFORM_PROOF_INDEX = 4;
/** Count delivered posts, not drafts or failed attempts. Start with one master, then three short posts. */
export function deadsetLongformDue(recentFormatsNewestFirst: string[]): boolean {
  return !recentFormatsNewestFirst.slice(0, 3).includes(DEADSET_LONGFORM);
}
export function supportedCarousel(manifest: Record<string, unknown>, count: number): boolean {
  return count === 2 || count === 6 || (manifest.app_slug === 'deadset' && manifest.format === DEADSET_LONGFORM && count === DEADSET_LONGFORM_SLIDES);
}
