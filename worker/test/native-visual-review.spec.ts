import { describe, expect, it } from 'vitest';
import { nativeVisualReviewBlocker, NATIVE_VISUAL_STANDARD } from '../src/lib/native-visual-review';

const hook = 'Got a plan for tonight?';
const caption = 'A week planned before the first set.';
const photoUrls = ['https://media.example/a.jpg', 'https://media.example/b.jpg'];
const review = {
  standard: NATIVE_VISUAL_STANDARD, result: 'pass', reviewer: 'agent', checked_at: '2026-09-10T22:00:00Z',
  photo_urls: photoUrls, hook, caption, full_frame: true, native_photo: true,
  truth_and_rights: true, all_slides_inspected: true, notes: 'Both final slides inspected against the native reference and recorded source rights.',
};
const input = { hook, caption, photoUrls, assetManifest: { app_slug: 'deadset', native_visual_review: review } };
describe('exact native visual release review', () => {
  it('does not confuse old quality flags with visual approval', () => {
    expect(nativeVisualReviewBlocker({ ...input, assetManifest: { app_slug: 'deadset', visual_review: { result: 'pass' }, creative_quality: { pass: true, score: 100 } } })).toMatch(/Exact final slides/);
  });
  it('accepts an exact reviewed export, without inventing a human receipt', () => expect(nativeVisualReviewBlocker(input)).toBeNull());
  it('invalidates review when a slide is rebuilt or reordered', () => {
    expect(nativeVisualReviewBlocker({ ...input, photoUrls: [...photoUrls].reverse() })).toBeTruthy();
    expect(nativeVisualReviewBlocker({ ...input, photoUrls: [photoUrls[0]!, 'https://media.example/new.jpg'] })).toBeTruthy();
  });
  it('invalidates changed hooks, captions and explicit holds', () => {
    expect(nativeVisualReviewBlocker({ ...input, hook: 'New hook' })).toBeTruthy();
    expect(nativeVisualReviewBlocker({ ...input, caption: 'New caption' })).toBeTruthy();
    expect(nativeVisualReviewBlocker({ ...input, assetManifest: { ...input.assetManifest, requires_owner_review: true } })).toBeTruthy();
  });
  it('requires every visual and rights check and applies to Cast too', () => {
    for (const field of ['full_frame', 'native_photo', 'truth_and_rights', 'all_slides_inspected']) {
      expect(nativeVisualReviewBlocker({ ...input, assetManifest: { app_slug: 'cast', native_visual_review: { ...review, [field]: false } } })).toBeTruthy();
    }
  });
  it('allows drafting without certifying any finished media', () => expect(nativeVisualReviewBlocker({ ...input, photoUrls: [] })).toBeNull());
});
