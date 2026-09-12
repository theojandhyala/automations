import { afterEach, describe, expect, it, vi } from 'vitest';
import { hasPassingVisualReview, parseVisualVerdict, reviewFinalCarousel, visualVerdictPasses } from '../src/lib/creative-visual-review';
import { proofReaction } from '../src/lib/creative-direction';
import { selectHookTemplate } from '../src/lib/creative-photo-templates';
import { getCreativePlaybook } from '../src/lib/creative-playbooks';
import type { Artifact, Env } from '../src/types';
import { stubFetch, testEnv } from './helpers';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const good = { visible_text: 'Already sorted.', observation: 'Clear weekly plan with an unobstructed short answer.',
  hierarchy: 9, legibility: 9, craft: 9, story_match: 9, safe_zones: true, truthful_proof: true,
  duplicate_copy: false, blockers: [] };
const artifact = { id: 'a', app_id: 'deadset-id', account_id: 'owned', hook: 'Got a plan for tonight?',
  caption: 'One less decision at the gym.', hashtags: ['gymtok', 'workoutplan', 'deadset'], media_type: 'photo',
  photo_urls: ['https://example.test/media/outputs/a/1.jpg', 'https://example.test/media/outputs/a/2.jpg'],
  asset_manifest: { app_slug: 'deadset', feature: 'workout_plan' }, is_aigc: false,
  run_id: null, status: 'draft', video_url: null, thumbnail_url: null, duration_s: null,
  publish_id: null, tiktok_post_id: null, error: null, scheduled_for: null, stage: 'review', stages: {},
  shot_notes: null, script: null, tiktok_privacy_level: 'PUBLIC_TO_EVERYONE', disable_comment: false,
  auto_add_music: true, brand_organic_toggle: true, brand_content_toggle: false, posting_consent_at: null } satisfies Artifact;

function fixture(payload: unknown = good) {
  const run = vi.fn().mockResolvedValue({ choices: [{ message: { content: JSON.stringify(payload) } }] });
  const env = { ...testEnv, PUBLIC_BASE_URL: 'https://example.test', AI: { run } } as unknown as Env;
  stubFetch([{ match: /storage\/v1\/object/, respond: () => new Response(new Uint8Array([255, 216, 255, 217]),
    { headers: { 'Content-Type': 'image/jpeg' } }) }]);
  return { env, run };
}
describe('independent final-image review', () => {
  it('signs a real two-image review and invalidates altered copy, media, order and destination', async () => {
    const { env, run } = fixture();
    const review = await reviewFinalCarousel(env, artifact);
    expect(run).toHaveBeenCalledTimes(2);
    const reviewed = { ...artifact, asset_manifest: { ...artifact.asset_manifest, visual_review: review } };
    expect(await hasPassingVisualReview(env, reviewed)).toBe(true);
    expect(await hasPassingVisualReview(env, { ...reviewed, asset_manifest: { ...reviewed.asset_manifest,
      visual_review: { ...review, version: 'cast-deadset-2026-09-11-native-v3' } } })).toBe(false);
    for (const patch of [{ caption: 'Changed' }, { account_id: 'another' }, { photo_urls: [...artifact.photo_urls].reverse() }])
      expect(await hasPassingVisualReview(env, { ...reviewed, ...patch })).toBe(false);
    expect(await hasPassingVisualReview(env, { ...reviewed, asset_manifest: { ...reviewed.asset_manifest,
      visual_review: { ...review, slides: [{ ...good, observation: 'Forged positive assessment of the slide.' }, good] } } })).toBe(false);
  });
  it('reviews every slide of a six-slide Cast editorial', async () => {
    const { env, run } = fixture();
    const cast = { ...artifact, photo_urls: Array.from({ length: 6 }, (_, i) => `https://example.test/media/outputs/cast/${i}.jpg`), asset_manifest: { app_slug: 'cast', format: 'cast_editorial_carousel' } };
    const review = await reviewFinalCarousel(env, cast);
    expect(run).toHaveBeenCalledTimes(6);
    expect(await hasPassingVisualReview(env, { ...cast, asset_manifest: { ...cast.asset_manifest, visual_review: review } })).toBe(true);
    expect(await hasPassingVisualReview(env, { ...cast, photo_urls: cast.photo_urls.slice(0, 5), asset_manifest: { ...cast.asset_manifest, visual_review: review } })).toBe(false);
  });
  it('fails closed on model outages, malformed JSON and missing image data', async () => {
    const { env, run } = fixture(); run.mockRejectedValue(new Error('model unavailable'));
    expect((await reviewFinalCarousel(env, artifact)).pass).toBe(false);
    run.mockResolvedValue({ choices: [{ message: { content: '{broken' } }] });
    expect((await reviewFinalCarousel(env, artifact)).pass).toBe(false);
    expect(await hasPassingVisualReview(env, artifact)).toBe(false);
    expect(() => parseVisualVerdict({ pass: true, score: 100 })).toThrow();
  });
  it('normalizes only exact numeric score strings without accepting prose or missing scores', () => {
    expect(parseVisualVerdict({ ...good, hierarchy: '8' }).hierarchy).toBe(8);
    expect(() => parseVisualVerdict({ ...good, hierarchy: 'strong' })).toThrow();
    expect(() => parseVisualVerdict({ ...good, hierarchy: '' })).toThrow();
    expect(() => parseVisualVerdict({ ...good, hierarchy: '8/10' })).toThrow();
  });
  it('blocks duplicate captions and misleading proof regardless of high scores', () => {
    expect(visualVerdictPasses({ ...good, duplicate_copy: true })).toBe(false);
    expect(visualVerdictPasses({ ...good, truthful_proof: false })).toBe(false);
    for (const dimension of ['hierarchy', 'legibility', 'craft', 'story_match'])
      expect(visualVerdictPasses({ ...good, [dimension]: 7 })).toBe(false);
    expect(visualVerdictPasses({ ...good, safe_zones: false })).toBe(false);
  });
  it('retains the authored reaction and varies native gym sources', () => {
    expect(proofReaction('Already sorted.', 'Generic feature sentence')).toBe('Already sorted.');
    expect(proofReaction('Download this revolutionary app now', 'Saved.')).toBe('Saved.');
    const queries = ['a', 'b', 'c'].map(id => selectHookTemplate(getCreativePlaybook('deadset')!, id)?.searchQuery);
    expect(new Set(queries).size).toBe(3);
  });
});
