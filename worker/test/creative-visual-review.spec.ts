import { CAST_BRAND_SHA256 } from '../src/lib/cast-brand';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { finalImageReviewPrompt, hasPassingVisualReview, parseVisualVerdict, reviewFinalCarousel, visualVerdictPasses } from '../src/lib/creative-visual-review';
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
  it('keeps Cast editorial and promotion roles separate from Deadset branding requirements', () => {
    const cast = { ...artifact, photo_urls: Array.from({ length: 6 }, (_, i) => `https://example.test/${i}.jpg`), asset_manifest: { app_slug: 'cast', format: 'cast_editorial_carousel' } };
    const item = finalImageReviewPrompt(cast, 4);
    const promotion = finalImageReviewPrompt(cast, 5);
    expect(item).toContain('Current slide number: 5 of 6.');
    expect(item).toContain('NOT THE FINAL PROMOTION');
    expect(promotion).toContain('THIS IS THE FINAL CAST PROMOTION');
    expect(promotion).toContain('prominent exact official Cast fishing logo');
    expect(promotion).toContain('readable genuine app evidence');
    expect(promotion).not.toContain('screenshot is optional');
    expect(promotion).not.toContain('Every Deadset product/feature slide');
    expect(finalImageReviewPrompt(artifact, 1)).toContain('Every Deadset product/feature slide');
    expect(finalImageReviewPrompt(artifact, 1)).toContain('deliberate visible Deadset red/black brand presence');
  });

  it('reviews the opening hook and branded answer under their distinct roles', () => {
    expect(finalImageReviewPrompt(artifact,0)).toContain('THIS IS THE OPENING LIFESTYLE HOOK');
    expect(finalImageReviewPrompt(artifact,1)).toContain('THIS IS THE PRODUCT ANSWER');
    expect(finalImageReviewPrompt(artifact,1)).toContain('Require the exact prominent Deadset logo');
  });

  it('compares final proof with the original source and signs that evidence without relaxing the verdict', async () => {
    const { env, run } = fixture();
    stubFetch([
      { match: /rest\/v1\/creative_assets/, respond: () => Response.json([{ storage_path: 'features/deadset/plan/original.png' }]) },
      { match: /storage\/v1\/object/, respond: () => new Response(new Uint8Array([255, 216, 255, 217]), { headers: { 'Content-Type': 'image/jpeg' } }) },
    ]);
    const withProof = { ...artifact, asset_manifest: { ...artifact.asset_manifest, production: { feature_asset: { id: 'proof-id', source_kind: 'owner_upload', composition: 'app_screen' } } } };
    const review = await reviewFinalCarousel(env, withProof);
    expect(review.proof_reference?.asset_id).toBe('proof-id');
    expect(review.proof_reference?.sha256).toMatch(/^[0-9a-f]{64}$/);
    const content = run.mock.calls[1]![1].messages[0].content;
    expect(content.filter((part: { type: string }) => part.type === 'image_url')).toHaveLength(2);
    expect(await hasPassingVisualReview(env, { ...withProof, asset_manifest: { ...withProof.asset_manifest, visual_review: review } })).toBe(true);
    expect(await hasPassingVisualReview(env, { ...withProof, asset_manifest: { ...withProof.asset_manifest, visual_review: { ...review, proof_reference: { ...review.proof_reference, sha256: '0'.repeat(64) } } } })).toBe(false);
    run.mockResolvedValue({ choices: [{ message: { content: JSON.stringify({ ...good, craft: 7, blockers: ['Final proof is obstructed.'] }) } }] });
    expect((await reviewFinalCarousel(env, withProof)).pass).toBe(false);
  });
  it('fails closed if an expected original product capture cannot be resolved', async () => {
    const { env, run } = fixture();
    stubFetch([{ match: /rest\/v1\/creative_assets/, respond: () => Response.json([]) }]);
    const result = await reviewFinalCarousel(env, { ...artifact, asset_manifest: { ...artifact.asset_manifest, production: { feature_asset: { id: 'missing', source_kind: 'owner_upload', composition: 'app_screen' } } } });
    expect(result.pass).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });
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
  it('reviews all ten Deadset slides and compares original proof only on slide five', async () => {
    const { env, run } = fixture();
    stubFetch([
      {match:/rest\/v1\/creative_assets/,respond:()=>Response.json([{storage_path:'features/deadset/logger/original.png'}])},
      {match:/storage\/v1\/object/,respond:()=>new Response(new Uint8Array([255,216,255,217]),{headers:{'Content-Type':'image/jpeg'}})},
    ]);
    const long = {...artifact,photo_urls:Array.from({length:10},(_,i)=>`https://example.test/media/outputs/long/${i}.jpg`),asset_manifest:{app_slug:'deadset',format:'deadset_rules_carousel',production:{feature_asset:{id:'proof-id',source_kind:'owner_upload',composition:'app_screen'}}}};
    const review=await reviewFinalCarousel(env,long);
    expect(run).toHaveBeenCalledTimes(10);
    expect(review.pass).toBe(true);
    for(let i=0;i<10;i++) expect(run.mock.calls[i]![1].messages[0].content.filter((p:{type:string})=>p.type==='image_url')).toHaveLength(i===4?2:1);
    const released={...long,asset_manifest:{...long.asset_manifest,visual_review:review}};
    expect(await hasPassingVisualReview(env,released)).toBe(true);
    expect(await hasPassingVisualReview(env,{...released,photo_urls:[...released.photo_urls].reverse()})).toBe(false);
    run.mockResolvedValueOnce({choices:[{message:{content:JSON.stringify({...good,craft:7,blockers:['Unclear hook']})}}]});
    expect((await reviewFinalCarousel(env,long)).pass).toBe(false);
  });
  it('reviews every slide of a six-slide Cast editorial', async () => {
    const { env, run } = fixture();
    stubFetch([
      {match:/rest\/v1\/creative_assets/,respond:()=>Response.json([{storage_path:'features/cast/catch_log/original.png'}])},
      {match:/storage\/v1\/object/,respond:()=>new Response(new Uint8Array([255,216,255,217]),{headers:{'Content-Type':'image/jpeg'}})},
    ]);
    const cast = { ...artifact, photo_urls: Array.from({ length: 6 }, (_, i) => `https://example.test/media/outputs/cast/${i}.jpg`), asset_manifest: { app_slug: 'cast', format: 'cast_editorial_carousel', production:{feature_asset:{id:'proof-id',source_kind:'owner_upload',composition:'app_screen'},brand_asset:{sha256:CAST_BRAND_SHA256}} } };
    const review = await reviewFinalCarousel(env, cast);
    expect(run).toHaveBeenCalledTimes(6);
    for(let i=0;i<6;i++) expect(run.mock.calls[i]![1].messages[0].content.filter((p:{type:string})=>p.type==='image_url')).toHaveLength(i===5?2:1);
    expect(review.proof_reference?.asset_id).toBe('proof-id');
    expect((await reviewFinalCarousel(env,{...cast,asset_manifest:{...cast.asset_manifest,production:{}}})).pass).toBe(false);
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
