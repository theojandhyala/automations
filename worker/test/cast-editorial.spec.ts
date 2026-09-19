import { CAST_BRAND_SHA256 } from '../src/lib/cast-brand';
import { describe, it, expect, vi } from 'vitest';
import { CAST_EDITORIAL_CONCEPTS, CAST_EDITORIAL_FORMAT, editorialSlides, planCastEditorial, castEditorialHtml } from '../src/lib/cast-editorial';
import { createCastEditorialDrafts } from '../src/automations/cast-editorial-drafts';
import { assessCreativeQuality } from '../src/lib/creative-quality';
import type { RunContext } from '../src/lib/runner';
import { visualReviewFixture } from './visual-review-fixture';

const row = (c: typeof CAST_EDITORIAL_CONCEPTS[number]) => ({ hook: c.hook, asset_manifest: { format: CAST_EDITORIAL_FORMAT, editorial_id: c.id, promotional: c.promotional } });
const manifest = (i = 0) => ({ format: CAST_EDITORIAL_FORMAT, app_slug: 'cast', promotional: CAST_EDITORIAL_CONCEPTS[i]!.promotional, slides: editorialSlides(CAST_EDITORIAL_CONCEPTS[i]!), generated_media: false, generated_people: false, fabricated_ui: false, source_policy: 'licensed_real_only', production: {feature_asset:{id:'proof-id',source_kind:'owner_upload',composition:'app_screen'},brand_asset:{sha256:CAST_BRAND_SHA256},per_slide_sources: Array.from({length:6}, (_,i) => ({id:i+1,source_url:`https://www.pexels.com/photo/${i+1}/`}))} });
const quality = (extra: Record<string, unknown> = {}, urls?: string[]) => assessCreativeQuality({ hook: CAST_EDITORIAL_CONCEPTS[0]!.hook, caption: CAST_EDITORIAL_CONCEPTS[0]!.caption, hashtags: ['fishing', 'fishingtips', 'angling'], mediaType: 'photo', assetManifest: { ...manifest(), ...extra }, photoUrls: urls });

describe('Cast curated editorial route', () => {
  it('keeps topics distinct and promotes Cast on every final slide', () => {
    const batch = planCastEditorial([], 10);
    expect(batch.every(c => c.promotional)).toBe(true);
    expect(batch.every(c => /Cast/.test(c.items[4]![1]) && /App Store/.test(c.items[4]![1]))).toBe(true);
    expect(planCastEditorial(batch.slice(0,3).map(row).reverse(), 3).map(c => c.id)).toEqual(batch.slice(3,6).map(c => c.id));
  });
  it('stops rather than repeating an exhausted bank', () => {
    expect(planCastEditorial(CAST_EDITORIAL_CONCEPTS.map(row), 3)).toEqual([]);
  });
  it('stores six-slide promotional drafts with explicit Cast and store context', async () => {
    const insertMany = vi.fn();
    const ctx = { runId: 'run', db: { insertMany } } as unknown as RunContext;
    await createCastEditorialDrafts(ctx, 'cast-app', 'cast-account', 3, []);
    const rows = insertMany.mock.calls[0]![1];
    expect(rows).toHaveLength(3);
    for (const r of rows) {
      expect(r.asset_manifest.slides).toHaveLength(6);
      expect(r.asset_manifest.creative_quality.pass).toBe(true);
      expect(r.asset_manifest.requires_owner_review).toBe(true);
      expect(r.caption).toMatch(/Cast/);
      expect(r.caption).toMatch(/app store/i);
      expect(r.brand_organic_toggle).toBe(true);
      expect(r.status).toBe('draft');
      expect(r.is_aigc).toBe(false);
      expect(r.account_id).toBe('cast-account');
    }
  });
  it('rejects missing slides, generated media and final slides without Cast promotion', () => {
    const urls = Array(6).fill('https://example.test/image.jpg');
    expect(quality({}, urls).pass).toBe(false);
    expect(quality({native_visual_review: visualReviewFixture(CAST_EDITORIAL_CONCEPTS[0]!.hook, CAST_EDITORIAL_CONCEPTS[0]!.caption, urls)}, urls).pass).toBe(true);
    expect(quality({}, Array(2).fill('https://example.test/image.jpg')).pass).toBe(false);
    expect(quality({generated_media:true}).pass).toBe(false);
    const slides=editorialSlides(CAST_EDITORIAL_CONCEPTS[0]!);
    slides[5]!.body='Keep a note while the session is fresh.';
    expect(quality({slides}).pass).toBe(false);
  });
  it('keeps every curated slide inside copy limits and escapes HTML', () => {
    for (const c of CAST_EDITORIAL_CONCEPTS) {
      expect(editorialSlides(c)).toHaveLength(6);
      for (const slide of editorialSlides(c)) expect(() => castEditorialHtml({imageUrl:'https://example.test/photo.jpg',overlay:slide.overlay,editorial:slide,role:slide.role==='hook'?'hook':'feature'})).not.toThrow();
    }
    const html=castEditorialHtml({imageUrl:'x" onerror="bad',overlay:'<script>bad</script>',editorial:{body:'Use <real> photos',kicker:'1 / 6'},role:'hook'});
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;real&gt;');
    const match = html.match(/\.copy\{[^}]*left:(\d+)px;width:(\d+)px/);
    expect(match).not.toBeNull();
    const left = Number(match![1]), width = Number(match![2]);
    expect(left + width / 2).toBe(540);
    expect(left).toBe(1080 - left - width);
  });
});

import { produceCarousels } from '../src/automations/tiktok-produce';
it('lets an explicit mission reach production even when the ordinary ready buffer is full', async () => {
  const select = vi.fn(async (_table: string, query: string) => query.includes('status=in.(approved,publishing)') ? Array.from({length: 12}, (_, i) => ({id: String(i)})) : []);
  const selectOne = vi.fn(async (table: string) => table === 'apps' ? {id:'cast'} : {id:'mission', draft_run_id:'requested-run', draft_count:1});
  const ctx = { trigger:'cron', automation:{config:{app_slug:'cast'}}, env:{}, db:{select,selectOne,update:vi.fn()}, runId:'producer-run' } as unknown as RunContext;
  const result = await produceCarousels.run(ctx) as {reason?:string};
  expect(result.reason).not.toBe('Three-day ready buffer is full');
  expect(select.mock.calls.some(([,q])=>q.includes('run_id=eq.requested-run'))).toBe(true);
});

it('holds repeated or undocumented Cast photographs even with a passing image receipt', () => {
  const urls=Array.from({length:6},(_,i)=>`https://example.test/slide-${i}.jpg`);
  const receipt=visualReviewFixture(CAST_EDITORIAL_CONCEPTS[0]!.hook,CAST_EDITORIAL_CONCEPTS[0]!.caption,urls);
  const repeat=quality({native_visual_review:receipt,production:{per_slide_sources:Array(6).fill({id:42,source_url:'https://www.pexels.com/photo/42/'})}},urls);
  expect(repeat.blockers).toContain('Cast requires six distinct recorded photo sources. Replace repeated backgrounds before release.');
  expect(quality({native_visual_review:receipt,production:{stock:{id:42}}},urls).pass).toBe(false);
});
