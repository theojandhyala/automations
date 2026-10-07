import { env } from 'cloudflare:test';
import { beforeAll, beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { activeTikTokAccounts } from '../src/lib/tiktok-health';
import { MANAGED_BRANDS, publicRelease, newBrandReviewPrompt, isTruthfulPrelaunchPreview } from '../src/lib/managed-brands';
import { brandSlideHtml, safeNewBrandHook } from '../src/lib/new-brand-creative';
import { visualVerdictPasses } from '../src/lib/creative-visual-review';
import type { Env, Artifact } from '../src/types';
import type { Db } from '../src/lib/db';
const db=env.TEST_OPERATIONS_DB; const bindings={...env,OPERATIONS_DB:db} as unknown as Env;
beforeAll(async()=>{await db.prepare('CREATE TABLE IF NOT EXISTS cloud_brand_release(app_slug TEXT PRIMARY KEY,state TEXT NOT NULL)').run();});
beforeEach(async()=>{await db.prepare('DELETE FROM cloud_brand_release').run();});
afterEach(()=>vi.unstubAllGlobals());
describe('four brand release boundaries',()=>{
 it('checks all exact connected brands even when promotion is paused and rejects mismatched handles',async()=>{
  const apps=Object.keys(MANAGED_BRANDS).map(slug=>({id:slug,slug}));
  const accounts=Object.entries(MANAGED_BRANDS).map(([slug,p])=>({app_id:slug,handle:p.handle}));
  const fake={select:vi.fn(async(table:string,query:string)=>{if(table==='apps'){expect(query).not.toContain('promotion_enabled');return apps;}return [...accounts,{app_id:'lifescore',handle:'reclaim.addiction.app'}];})} as unknown as Db;
  expect(await activeTikTokAccounts(fake)).toEqual(accounts);
 });
 it('does not equate an empty listing or wrong app with release',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>Response.json({results:[{trackId:123,wrapperType:'software'}]})));
  expect((await publicRelease(bindings,'lifescore')).available).toBe(false);
 });
 it('requires a matching software listing and caches bounded successful checks',async()=>{
  const fetcher=vi.fn(async()=>Response.json({results:[{trackId:6800926536,wrapperType:'software',trackViewUrl:'https://apps.apple.com/gb/app/id6800926536'}]}));vi.stubGlobal('fetch',fetcher);
  const now=Date.now();expect((await publicRelease(bindings,'reclaim',now)).available).toBe(true);
  await publicRelease(bindings,'reclaim',now+1000);expect(fetcher).toHaveBeenCalledTimes(1);
  await publicRelease(bindings,'reclaim',now+3600001);expect(fetcher).toHaveBeenCalledTimes(2);
 });
 it('fails closed when Apple is unavailable instead of treating an old pass as fresh',async()=>{
  await db.prepare('INSERT INTO cloud_brand_release VALUES(?,?)').bind('reclaim',JSON.stringify({available:true,checked_at:'2020-01-01T00:00:00Z'})).run();
  vi.stubGlobal('fetch',vi.fn(async()=>{throw new Error('offline');}));
  expect((await publicRelease(bindings,'reclaim')).available).toBe(false);
 });
 it('keeps brand context separate without changing the pixel threshold',()=>{
  expect(newBrandReviewPrompt({asset_manifest:{app_slug:'deadset'}} as unknown as Artifact,0)).toBeNull();
  const a={asset_manifest:{app_slug:'reclaim'}} as unknown as Artifact;
  expect(newBrandReviewPrompt(a,1)).toContain('No cures');
  const verdict={visible_text:'hello',observation:'Actual observed image detail',hierarchy:8,legibility:8,craft:7,story_match:8,safe_zones:true,truthful_proof:true,duplicate_copy:false,blockers:[]};
  expect(visualVerdictPasses(verdict)).toBe(false);
 });
 it('allows only truthful LifeScore and Reclaim previews before public release',()=>{
  const preview={hook:'A small check-in for today',caption:'Follow the build as it takes shape.',asset_manifest:{release_context:'preview; no availability claims'}} as unknown as Artifact;
  expect(isTruthfulPrelaunchPreview(preview,'lifescore')).toBe(true);
  expect(isTruthfulPrelaunchPreview({...preview,caption:'Download it on the App Store.'},'lifescore')).toBe(false);
  expect(isTruthfulPrelaunchPreview(preview,'deadset')).toBe(false);
 });
 it('escapes generated text and rejects claims before rendering',()=>{
  expect(safeNewBrandHook('A cure for addiction')).toBe(false);
  expect(safeNewBrandHook('Your next step can be small')).toBe(true);
  const html=brandSlideHtml('lifescore',0,'<script>bad</script>','context',['one'], 'https://example.test/proof','https://example.test/logo');
  expect(html).not.toContain('<script>bad');expect(html).toContain('&lt;script&gt;');
  expect(brandSlideHtml('reclaim',1,'hook','context',[],'x','y')).toContain('APP PREVIEW · EXAMPLE DATA');
 });
});
