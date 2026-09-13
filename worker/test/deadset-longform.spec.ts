import { describe,it,expect,vi,afterEach } from 'vitest';
import { nativePostSchema,importNativePost } from '../src/lib/native-post-import';
import { DEADSET_LONGFORM as format, DEADSET_LONGFORM_REFERENCE as reference, supportedCarousel,deadsetLongformDue } from '../src/lib/deadset-longform';
import { assessCreativeQuality } from '../src/lib/creative-quality';
import { finalImageReviewPrompt, visualReviewVersion } from '../src/lib/creative-visual-review';
import { Db } from '../src/lib/db';
import { stubFetch,testEnv } from './helpers';
import type { Artifact,Env } from '../src/types';
const pack=()=>({version:1,id:'c536aa93-47e5-444b-aab8-e576a43d66ec',app_slug:'deadset',format,proof_asset_id:'c536aa93-47e5-444b-aab8-e576a43d66ed',feature_key:'live_logger',promotional:true,reference_urls:[reference],hook:'7 gym habits worth keeping',caption:'Give your next session a plan with Deadset. On the App Store.',hashtags:['gymtok','deadset','gymhabits'],slides:Array.from({length:10},(_,i)=>({file:`slide-${String(i+1).padStart(2,'0')}.jpg`,role:i===0?'hook':i===4?'feature':'editorial',overlay:i===0?'7 gym habits worth keeping':i===4?'Keep your reps in Deadset':i===9?'Pick one for your next session':`${i<4?i:i-1}. Useful habit ${i}`,body:i===4?'Your planned reps in view. Find Deadset on the App Store.':'A useful concrete action.',source:{kind:i===4?'first_party_ui':'licensed_photo',source_url:`https://example.test/${i}`,creator:'Owner',licence_url:'https://www.pexels.com/license/'}}))});
afterEach(()=>vi.unstubAllGlobals());
describe('occasional Deadset rules carousel',()=>{
 it('imports ten exact images only after resolving and classifying the real registered screen',async()=>{
  const p=pack();p.slides[4]!.source.source_url='https://example.test/media/features/deadset/live_logger/original.png';
  const run=vi.fn().mockResolvedValue({choices:[{message:{content:'{"composition":"app_screen"}'}}]});
  const env={...testEnv,PUBLIC_BASE_URL:'https://example.test',AI:{run}} as unknown as Env;
  const routes=[
   {match:/rest\/v1\/artifacts/,respond:(c:any)=>Response.json(c.method==='POST'?[c.body]:[])},
   {match:/rest\/v1\/apps/,respond:()=>Response.json([{id:'app'}])},
   {match:/rest\/v1\/tiktok_accounts/,respond:()=>Response.json([{id:'account'}])},
   {match:/rest\/v1\/creative_assets/,respond:()=>Response.json([{id:p.proof_asset_id,storage_path:'features/deadset/live_logger/original.png'}])},
   {match:/storage\/v1\/object/,respond:()=>new Response(new Uint8Array([255,216,255,217]),{headers:{'Content-Type':'image/jpeg'}})},
  ];
  const req=()=>{const form=new FormData();form.set('post',JSON.stringify(p));for(const slide of p.slides)form.append('slides',new File([new Uint8Array([255,216,255,192,0,17,8,7,128,4,56,3,1,17,0,2,17,0,3,17,0,255,217])],slide.file,{type:'image/jpeg'}));return new Request('https://example.test/import',{method:'POST',body:form});};
  const calls=stubFetch(routes);const res=await importNativePost(req(),env,new Db(env));expect(res.status).toBe(201);
  const result=await res.json() as Artifact;expect(result.photo_urls).toHaveLength(10);expect(result.status).toBe('draft');expect(result.asset_manifest.production).toMatchObject({feature_asset:{id:p.proof_asset_id,composition:'app_screen'}});expect(result.asset_manifest.visual_review).toBeUndefined();expect(calls.calls.some(c=>c.url.includes('asset_key=eq.live_logger'))).toBe(true);
  run.mockResolvedValue({choices:[{message:{content:'{"composition":"finished_promotion"}'}}]});stubFetch(routes);expect((await importNativePost(req(),env,new Db(env))).status).toBe(400);
 });
 it('accepts ten ordered slides only in the dedicated Deadset lane',()=>{expect(nativePostSchema.safeParse(pack()).success).toBe(true);expect(nativePostSchema.safeParse({...pack(),format:undefined}).success).toBe(false);expect(nativePostSchema.safeParse({...pack(),app_slug:'cast'}).success).toBe(false);expect(supportedCarousel({app_slug:'cast',format},10)).toBe(false);});
 it('rejects missing proof, moved promotion, unfinished counts and invented sources',()=>{for(const change of [{proof_asset_id:undefined},{slides:pack().slides.slice(0,9)},{reference_urls:['https://example.test']},{slides:pack().slides.map((s,i)=>i===4?{...s,source:{...s.source,kind:'licensed_photo'}}:s)}])expect(nativePostSchema.safeParse({...pack(),...change}).success).toBe(false);});
 it('enforces the seven rules and promotion before independent pixel review',()=>{const p=pack();const manifest={app_slug:'deadset',format,slides:p.slides.map(s=>({...s,role:s.role==='feature'?'feature_proof':s.role})),promotional:true,generated_media:false,generated_people:false,fabricated_ui:false,source_policy:'licensed_real_only'};const input={hook:p.hook,caption:p.caption,hashtags:p.hashtags,mediaType:'photo' as const,assetManifest:manifest};expect(assessCreativeQuality(input).pass).toBe(true);expect(assessCreativeQuality({...input,assetManifest:{...manifest,slides:manifest.slides.map((s,i)=>i===4?{...s,overlay:'Great app',body:'Keep going'}:s)}}).pass).toBe(false);expect(assessCreativeQuality({...input,assetManifest:{...manifest,slides:manifest.slides.map((s,i)=>i===6?{...s,overlay:'4. Repeated number'}:s)}}).pass).toBe(false);});
 it('keeps the long lane explicit in the independent critic and signed version',()=>{const artifact={asset_manifest:{app_slug:'deadset',format,slides:pack().slides},photo_urls:Array(10).fill('https://example.test/photo')} as unknown as Artifact;expect(finalImageReviewPrompt(artifact,4)).toContain('promotion on slide 5');expect(visualReviewVersion(artifact)).toContain('-long-rules-v2');});
 it('distinguishes the closing prompt from the required product promotion',()=>{const artifact={asset_manifest:{app_slug:'deadset',format,slides:pack().slides},photo_urls:Array(10).fill('https://example.test/photo')} as unknown as Artifact;expect(finalImageReviewPrompt(artifact,9)).toContain('THIS SLIDE IS THE EDITORIAL CLOSING PROMPT');expect(finalImageReviewPrompt(artifact,4)).toContain('THIS SLIDE IS THE PRODUCT PROMOTION');expect(finalImageReviewPrompt(artifact,9)).toContain('same release threshold');});
 it('allows one master then three intervening delivered short posts',()=>{expect(deadsetLongformDue([])).toBe(true);expect(deadsetLongformDue([format])).toBe(false);expect(deadsetLongformDue(['short','short',format])).toBe(false);expect(deadsetLongformDue(['short','short','short',format])).toBe(true);});
});
