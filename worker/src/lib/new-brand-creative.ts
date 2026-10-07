import type { Artifact, Env, TikTokAccount } from '../types';
import type { Handler } from '../automations/registry';
import type { openSlideRenderer, closeSlideRenderer } from './slide-renderer';
import type { uploadMedia, publicMediaUrl } from './storage';
import type { reviewFinalCarousel, visualReviewVersion } from './creative-visual-review';
import type { completeJson } from './ai';
import { MANAGED_BRANDS, publicRelease } from './managed-brands';
export const BRAND_RENDERER='four-brand-editorial-v4';
type Brand='lifescore'|'reclaim';
const plans = {
 lifescore: [
  ['Your day is more than one habit','Look beyond the streak.',['Notice your sleep.','Record your movement.','Make room for a check-in.']],
  ['What did today actually look like','Give your day some context.',['What did you record?','What needed more attention?','What will you try tomorrow?']],
  ['A rest day still belongs in your week','Keep the whole picture.',['Log the day you had.','Leave room for recovery.','Pick one manageable priority.']],
  ['Stop trying to perfect every single day','Start with an honest check-in.',['Record what happened.','Notice a pattern.','Choose one thing to repeat.']],
  ['Five areas to check before tomorrow','A little structure for tonight.',['Sleep and movement.','Focus and nutrition.','An honest daily check-in.']],
  ['Make your next routine a little smaller','Choose one clear starting point.',['One priority.','A time you can actually keep.','A check-in after you try.']],
 ],
 reclaim: [
  ['Your support toolkit can start with one option','No perfect routine required.',['Choose a tool to try.','Give yourself a moment.','Check in when you are ready.']],
  ['You do not need a perfect restart','Choose a next step you can name.',['Notice what is happening.','Choose one support option.','Ask someone you trust.']],
  ['Write the next step before you need it','Keep your plan somewhere easy to find.',['One first move.','One backup option.','One person you can contact.']],
  ['Your check-in does not need a good ending','It just needs to be honest.',['What happened?','What felt difficult?','What support would help next?']],
  ['Make asking for support a smaller step','Write the message in advance.',['Name someone you trust.','Say what you need.','Keep the message easy to find.']],
  ['A difficult day still deserves a check-in','No score to defend.',['Record the moment.','Leave out the judgement.','Name your next support option.']],
  ['Your support plan can stay simple','Start with something you can find.',['A short note.','A tool you want to try.','A trusted person to contact.']],
 ],
} as const;
const truth={lifescore:'LifeScore tracks sleep, movement, focus, nutrition and check-ins. Gamified score is not a medical measure. Only the actual pictured example Today’s Picture card is evidence.',reclaim:'Reclaim contains a coping toolkit with guided breathing, grounding, movement reset and ride-the-wave tools. These are optional tools, not treatments or guarantees. No real recovery records are shown.'};
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function brandSlideHtml(slug:Brand,slide:number,hook:string,deck:string,steps:readonly string[],proof:string,logo:string) {
 const name=MANAGED_BRANDS[slug].name, accent=slug==='lifescore'?'#25e7a0':'#c6ff4b';
 const crop=slug==='lifescore'?{x:42,y:1540,w:1200,h:640}:{x:40,y:1365,w:700,h:465};
 const scale=820/crop.w;
 const header=`<div class="brand" data-safe><img src="${escape(logo)}" alt=""><span>${name}</span><small>${slide+1} / 2</small></div>`;
 const content=slide===0?`<h1 data-safe>${escape(hook)}</h1><p class="deck" data-safe>${escape(deck)}</p><div class="steps">${steps.map((s,i)=>`<div class="step" data-safe><b>0${i+1}</b><span>${escape(s)}</span></div>`).join('')}</div><p class="foot" data-safe>Save the idea. Make it your own. <span>Swipe →</span></p>`:
 `<h1 class="proof-title" data-safe>${slug==='lifescore'?'See the day.<br>Skip the judgement.':'A toolkit.<br>On your terms.'}</h1><p class="deck" data-safe>${slug==='lifescore'?'Five areas, in one daily check-in.':'Guided breathing, inside Reclaim.'}</p><div class="proof" data-safe style="height:${crop.h*scale}px"><img src="${escape(proof)}" style="width:${1284*scale}px;left:${-crop.x*scale}px;top:${-crop.y*scale}px"></div><p class="label" data-safe>APP PREVIEW · EXAMPLE DATA</p><p class="context" data-safe>${slug==='lifescore'?'A picture of your day.<br>Not a measure of your worth.':'Private tools for a next step.<br>No perfect streak required.'}</p><p class="foot" data-safe>Follow @${MANAGED_BRANDS[slug].handle}</p>`;
 return `<!doctype html><html><head><meta charset="utf-8"><style>*{box-sizing:border-box}html,body{margin:0;width:1080px;height:1920px;overflow:hidden}body{background:#080d0c;color:#f0f5f2;font-family:Arial,sans-serif;--accent:${accent}}body:before{content:'';position:absolute;inset:0;background:radial-gradient(ellipse at 80% 15%,${accent}18,transparent 65%);pointer-events:none}main{position:absolute;left:76px;top:254px;width:820px}.brand{display:flex;align-items:center;gap:18px;font-size:34px;font-weight:700;margin-bottom:68px}.brand img{width:54px;height:54px;object-fit:contain;border-radius:12px}.brand small{margin-left:auto;font-size:24px;color:#98a59e}h1{font-size:88px;line-height:1.03;letter-spacing:-4px;margin:0 0 30px;font-weight:800;overflow-wrap:break-word}.deck{font-size:34px;line-height:1.3;color:#b8c7bf;margin:0 0 46px}.steps{margin-top:70px}.step{border-top:1px solid #38473f;padding:30px 0;display:flex;gap:26px;align-items:center;font-size:43px;line-height:1.15}.step b{color:var(--accent);font-size:27px;font-weight:400}.foot{font-size:27px;color:#a6b9ae;margin:60px 0 0}.foot span{float:right;color:var(--accent)}.proof-title{font-size:78px}.proof{width:820px;position:relative;overflow:hidden;border-radius:24px;background:#0b100d}.proof img{position:absolute;max-width:none}.label{font-size:22px;letter-spacing:2px;color:#99b2a2;margin:22px 0}.context{font-size:33px;line-height:1.3;margin:30px 0 0}.proof~.foot{margin-top:30px}</style></head><body><main>${header}${content}</main></body></html>`;
}
export function safeNewBrandHook(hook:unknown):hook is string {
 return typeof hook==='string' && hook.length<=86 && hook.trim().split(/\s+/).length>=3 && hook.trim().split(/\s+/).length<=12
 && !/[<>\n]|\b(cure|guarantee|treat|therapy|quit|detox|withdrawal|diagnos|download|available|proven|percent|always|never|days? sober)\b|\d|%/i.test(hook);
}
type Dependencies={openSlideRenderer:typeof openSlideRenderer;closeSlideRenderer:typeof closeSlideRenderer;uploadMedia:typeof uploadMedia;publicMediaUrl:typeof publicMediaUrl;reviewFinalCarousel:typeof reviewFinalCarousel;visualReviewVersion:typeof visualReviewVersion;completeJson:typeof completeJson};
export function createBrandStudioHandler(d:Dependencies):Handler {return {
 key:'tiktok.brand-studio',name:'LifeScore / Reclaim cloud studio',description:'Creates original useful carousels with genuine product evidence, independent review and verified release gating.',
 async run(ctx){
  const slug=ctx.automation.config.app_slug;if(slug!=='lifescore'&&slug!=='reclaim')throw new Error('Unsupported brand studio');
  const release=await publicRelease(ctx.env,slug);
  const app=await ctx.db.selectOne<{id:string}>('apps',`slug=eq.${slug}&select=id`);
  if(!app)throw new Error('Missing app');
  const accounts=await ctx.db.select<TikTokAccount>('tiktok_accounts',`app_id=eq.${app.id}&status=eq.connected&select=*`);
  const account=accounts.find(a=>a.handle.replace(/^@/,'').toLowerCase()===MANAGED_BRANDS[slug].handle);
  if(!account)throw new Error('Exact connected account missing');
  const recent=await ctx.db.select<Artifact>('artifacts',`app_id=eq.${app.id}&select=*&order=created_at.desc&limit=90`);
  const retry=recent.find(a=>a.photo_urls.length===2 && ((a.asset_manifest.production as {renderer?:string})?.renderer===BRAND_RENDERER || slug==='lifescore' && (a.asset_manifest.production as {renderer?:string})?.renderer==='four-brand-editorial-v3')
    && (a.asset_manifest.visual_review as {blockers?:string[];version?:string})?.blockers?.some(b=>b.startsWith('Visual review unavailable:'))
    && (a.asset_manifest.visual_review as {version?:string}).version!==d.visualReviewVersion(a));
  if(retry){
   const review=await d.reviewFinalCarousel(ctx.env,retry);
   await ctx.db.update('artifacts',`id=eq.${retry.id}&status=eq.draft`,{asset_manifest:{...retry.asset_manifest,visual_review:review},error:review.pass?null:review.blockers.join(' ').slice(0,1800),stage:'review'});
   return {artifact_id:retry.id,rendered:0,review_pass:review.pass,blockers:review.blockers,release};
  }
  // Build a reviewed preview reserve while Apple review is pending, without buying unbounded unused artwork.
  if(recent.filter(a=>a.status==='draft'&&(a.asset_manifest.visual_review as {pass?:boolean})?.pass).length>=6)return {held:true,reason:'Six reviewed previews await release / booking',release};
  const sourceKey=slug==='reclaim'?'studio_proof_v2':'studio_proof_v1';
  const source=await ctx.db.selectOne<{id:string;storage_path:string}>('creative_assets',`app_slug=eq.${slug}&asset_key=eq.${sourceKey}&source_kind=eq.owner_upload&select=id,storage_path`);
  const logo=await ctx.db.selectOne<{storage_path:string}>('creative_assets',`app_slug=eq.${slug}&asset_key=eq.brand_logo&source_kind=eq.owner_upload&select=storage_path`);
  if(!source||!logo)throw new Error('First-party proof or official logo missing');
  let plan=plans[slug].find(p=>!recent.some(a=>a.hook===p[0]));
  let hook:string;
  if(plan)hook=plan[0];else{
   plan=plans[slug][recent.length%plans[slug].length]!;
   const ideas=await d.completeJson<{ideas:Array<{hook:string}>}>(ctx.env,{system:'Write ONE original useful editorial hook. No medical claims, outcomes, invented facts, app availability or promotional language. Output the required ideas JSON schema.',prompt:JSON.stringify({brand:slug,truth:truth[slug],idea:plan,avoid:recent.map(a=>a.hook),feedback:recent.slice(0,6).map(a=>a.error),requirements:'3–12 words, under 86 characters. Hook must match the specific supplied idea.'}),maxTokens:650});
   hook=ideas.ideas[0]?.hook??'';
   if(!safeNewBrandHook(hook)||recent.some(a=>a.hook?.toLowerCase()===hook.toLowerCase()))throw new Error('No safe, original hook returned; no render purchased');
  }
  const lessons=recent.filter(a=>a.error).slice(0,5).map(a=>({source:'previous_exact_visual_review',feedback:a.error}));
  let a=await ctx.db.insert<Artifact>('artifacts',{app_id:app.id,account_id:account.id,run_id:ctx.runId,status:'draft',stage:'edit',media_type:'photo',hook,caption:slug==='lifescore'?'A small check-in for the day you actually had.':'A small next step, on your terms.',hashtags:slug==='lifescore'?['#LifeScore','#DailyRoutine','#Habits']:['#Reclaim','#CheckIn','#SelfReflection'],photo_urls:[],is_aigc:false,auto_add_music:true,brand_organic_toggle:true,asset_manifest:{app_slug:slug,format:'two_slide_photo_carousel',feature:sourceKey,requires_owner_review:true,product_truth:truth[slug],release_context:'preview; no availability claims',lessons_to_address:lessons,slides:[{role:'hook',overlay:hook,source_requirement:'original typography'},{role:'feature_proof',overlay:plan[1],source_requirement:'first_party_ui',app_asset_key:sourceKey}],production:{renderer:BRAND_RENDERER,dimensions:{width:1080,height:1920},feature_asset:{id:source.id,source_kind:'owner_upload',composition:'app_screen'},proof_crop:slug==='lifescore'?{x:42,y:1540,w:1200,h:640}:{x:40,y:1365,w:700,h:465}}}});
  const browser=await d.openSlideRenderer(ctx.env);
  try{
   const page=await browser.newPage();await page.setViewport({width:1080,height:1920,deviceScaleFactor:1});
   const urls:string[]=[];
   for(let i=0;i<2;i++){
    await page.setContent(brandSlideHtml(slug,i,hook,plan[1],plan[2],d.publicMediaUrl(ctx.env,source.storage_path),d.publicMediaUrl(ctx.env,logo.storage_path)),{waitUntil:'networkidle0',timeout:30000});
    await page.waitForFunction('Array.from(document.images).every(i=>i.complete && i.naturalWidth>0)',{timeout:15000});
    const bad=await page.evaluate("Array.from(document.querySelectorAll('[data-safe]')).map(e=>{const r=e.getBoundingClientRect();return {tag:e.tagName,kind:e.className,x:r.left,y:r.top,right:r.right,bottom:r.bottom,overflow:!e.classList.contains('proof')&&(()=>{const range=document.createRange();range.selectNodeContents(e);const t=range.getBoundingClientRect();return t.left<64||t.right>904||t.top<240||t.bottom>1500;})()};}).filter(r=>r.x<64||r.right>904||r.y<240||r.bottom>1500||r.overflow)") as unknown[];
    if(bad.length)throw new Error('Slide '+(i+1)+' exceeds TikTok safe area: '+JSON.stringify(bad));
    const bytes=await page.screenshot({type:'jpeg',quality:94});const path=`outputs/${slug}/${a.id}/${crypto.randomUUID()}.jpg`;
    await d.uploadMedia(ctx.env,path,bytes,'image/jpeg');urls.push(d.publicMediaUrl(ctx.env,path));
   }
   const [updated]=await ctx.db.update<Artifact>('artifacts',`id=eq.${a.id}`,{photo_urls:urls,thumbnail_url:urls[0],stage:'review'});
   if(!updated)throw new Error('Artifact disappeared');a=updated;
  }catch(error){await ctx.db.update('artifacts',`id=eq.${a!.id}`,{error:error instanceof Error?error.message:'Render failed',stage:'edit'});throw error;}finally{await d.closeSlideRenderer(browser);}
  if(!a!)throw new Error('Rendered artifact disappeared');
  const review=await d.reviewFinalCarousel(ctx.env,a);
  await ctx.db.update('artifacts',`id=eq.${a.id}&status=eq.draft`,{asset_manifest:{...a.asset_manifest,visual_review:review},error:review.pass?null:review.blockers.join(' ').slice(0,1800),stage:'review'});
  return {artifact_id:a.id,rendered:1,review_pass:review.pass,blockers:review.blockers,release};
 }
};}
