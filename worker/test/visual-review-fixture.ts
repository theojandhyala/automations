import { NATIVE_VISUAL_STANDARD } from '../src/lib/native-visual-review';
/** Synthetic test evidence only. Never used by the production approval code. */
export const visualReviewFixture = (hook: string | null, caption: string | null, photo_urls: string[]) => ({
  standard: NATIVE_VISUAL_STANDARD, result: 'pass', reviewer: 'agent', checked_at: '2026-09-10T22:00:00Z',
  hook, caption, photo_urls, full_frame: true, native_photo: true, truth_and_rights: true,
  all_slides_inspected: true, notes: 'Test fixture for exact export review; not a real content approval.',
});
