// Surgical extension of the exported live release: never rebuild the unrelated dirty checkout.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {build} from '../worker/node_modules/esbuild/lib/main.js';
const [base,out,expectedSha]=process.argv.slice(2);
let s=await readFile(base+'/index.js','utf8');
if(createHash('sha256').update(s).digest('hex')!==expectedSha)throw new Error('Live base mismatch');
function patch(a,b){if(s.split(a).length!==2)throw new Error('Ambiguous release anchor: '+a.slice(0,100));s=s.replace(a,b);}
s='import { MANAGED_BRANDS, isManagedBrand, publicRelease, newBrandReviewPrompt } from "./managed-brands.mjs";\nimport { createBrandStudioHandler } from "./new-brand-creative.mjs";\n'+s;
s=`import { MANAGED_BRANDS, isManagedBrand, publicRelease, newBrandReviewPrompt } from "./managed-brands.mjs";
import { createBrandStudioHandler } from "./new-brand-creative.mjs";
const WELLBEING_APP_CLAIMS=/\\b(?:cure|treat(?:ment)?|therapy|diagnos(?:e|is)|guarantee(?:d)?|proven|quit|detox|withdrawal|days? sober|replace professional help)\\b/i;
const WELLBEING_PROOF_KEYS={lifescore:["studio_proof_v1"],reclaim:["studio_proof_v2"]};
function wellbeingCreativeBlockers(input,hook,caption,manifest){
 const keys=WELLBEING_PROOF_KEYS[String(manifest.app_slug)];if(!keys)return [];
 const blockers=[];const slides=Array.isArray(manifest.slides)?manifest.slides:[];const proof=manifest.production?.feature_asset;const truth=typeof manifest.product_truth==="string"?manifest.product_truth.trim():"";
 if(!truth||truth.length<24)blockers.push("Record the specific, truthful product context before releasing a wellbeing-app post.");
 if(!keys.includes(String(manifest.feature)))blockers.push("Use a registered first-party app feature for this account.");
 if(slides.length!==2||slides[0]?.role!=="hook"||slides[1]?.role!=="feature_proof"||!keys.includes(String(slides[1]?.app_asset_key)))blockers.push("Wellbeing-app posts need a relatable hook followed by the registered app proof.");
 if(proof?.source_kind!=="owner_upload"||proof?.composition!=="app_screen"||typeof proof?.id!=="string"||!proof.id)blockers.push("Wellbeing-app posts need a recorded owner-uploaded app screen as their proof.");
 if(WELLBEING_APP_CLAIMS.test(hook+" "+caption))blockers.push("Remove medical, recovery-outcome, or guaranteed-result claims from wellbeing-app creative.");
 if(/\\b(?:download|install|available now|on the app store)\\b/i.test(hook+" "+caption)&&manifest.release_context==="preview; no availability claims")blockers.push("Preview creative cannot claim the wellbeing app is publicly available.");
 return blockers;
}
`+s;
patch('promotion_enabled=eq.true&slug=in.(deadset,cast)&select=id,slug','slug=in.(deadset,cast,lifescore,reclaim)&select=id,slug');
patch('(app.slug === "deadset" ? "deadset.app" : "cast.fishing.app")','(isManagedBrand(app.slug) ? MANAGED_BRANDS[app.slug].handle : "")');
patch('return appSlug === "deadset" || appSlug === "cast";','return ["deadset","cast","lifescore","reclaim"].includes(appSlug);');
patch('function visualReviewVersion(artifact) {', 'function visualReviewVersion(artifact) {\nif(["lifescore","reclaim"].includes(String(artifact.asset_manifest.app_slug))) return CREATIVE_DIRECTION_VERSION+"-brand-critic-v2";');
patch('function finalImageReviewPrompt(artifact, index) {','function finalImageReviewPrompt(artifact, index) {\nconst specific = newBrandReviewPrompt(artifact,index); if(specific) return specific;');
patch('  if (manifest.format === DEADSET_LONGFORM) {','  blockers.push(...wellbeingCreativeBlockers(input,hook,caption,manifest));\n  if (manifest.format === DEADSET_LONGFORM) {');
patch('slug=in.(deadset,cast)&select=id,slug,promotion_enabled&order=slug.asc','slug=in.(deadset,cast,lifescore,reclaim)&select=id,slug,promotion_enabled&order=slug.asc');
patch('`${mission.slug === "deadset" ? "deadset" : "cast"}.${mission.slug === "deadset" ? "app" : "fishing.app"}`','(isManagedBrand(mission.slug) ? MANAGED_BRANDS[mission.slug].handle : "")');
patch('      if (!mission.promotion_enabled) {',`      const release = await publicRelease(ctx.env, mission.slug);
      if (!release.available) { for(const slot of targetSlots) missing.push({app:mission.slug,day:slot.localDay,slot:slot.localTime,reason:release.reason}); continue; }
      if (!mission.promotion_enabled) {`);
patch('var ACTIVE_PUBLISH_MISSIONS = /* @__PURE__ */ new Set(["deadset", "cast"]);','var ACTIVE_PUBLISH_MISSIONS = new Set(["deadset", "cast", "lifescore", "reclaim"]);');
patch('const routingError = missionRoutingError(artifact, account, app);','const routeError = missionRoutingError(artifact, account, app);\n      const release = !routeError && app ? await publicRelease(ctx.env,app.slug) : null;\n      const routingError = routeError || (release && !release.available ? release.reason : null);');
patch('(app?.slug === "cast" || app?.slug === "deadset") && artifact.media_type === "photo"','(app && ACTIVE_PUBLISH_MISSIONS.has(app.slug)) && artifact.media_type === "photo"');
patch("p.slug IN ('deadset','cast')", "p.slug IN ('deadset','cast','lifescore','reclaim')");
patch("WHEN 'deadset' THEN 'deadset.app' ELSE 'cast.fishing.app' END", "WHEN 'deadset' THEN 'deadset.app' WHEN 'cast' THEN 'cast.fishing.app' WHEN 'lifescore' THEN 'lifescore.app' WHEN 'reclaim' THEN 'reclaim.addiction.app' ELSE '' END");
patch('var HANDLERS = [','var brandStudio = createBrandStudioHandler({openSlideRenderer,closeSlideRenderer,uploadMedia,publicMediaUrl,reviewFinalCarousel,visualReviewVersion,completeJson});\nvar HANDLERS = [\n  brandStudio,');
patch('new Set(["tiktok.generate", "tiktok.produce", "tiktok.readiness", "tiktok.publish", "tiktok.reconcile", "analytics.sync", "hq.apple-sync"])','new Set(["tiktok.brand-studio", "tiktok.generate", "tiktok.produce", "tiktok.readiness", "tiktok.publish", "tiktok.reconcile", "analytics.sync", "hq.apple-sync"])');
patch('const producers = claimed.filter((automation) => automation.handler_key === "tiktok.produce");','const producers = claimed.filter((automation) => ["tiktok.produce","tiktok.brand-studio"].includes(automation.handler_key));');
patch('const other = claimed.filter((automation) => automation.handler_key !== "tiktok.produce");','const other = claimed.filter((automation) => !["tiktok.produce","tiktok.brand-studio"].includes(automation.handler_key));');
patch('  "tiktok.generate": external_exports.object({', '  "tiktok.brand-studio": external_exports.object({app_slug:external_exports.enum(["lifescore","reclaim"])}),\n  "tiktok.generate": external_exports.object({');
await mkdir(out,{recursive:true});await writeFile(out+'/index.js',s);
const names=['cloud-studio','cloud-studio-page','managed-brands','new-brand-creative'];
for(const name of names)await build({entryPoints:['worker/src/lib/'+name+'.ts'],bundle:true,format:'esm',target:'es2022',outfile:out+'/'+name+'.mjs'});
const modules=await Promise.all(['index.js',...names.map(n=>n+'.mjs')].map(async name=>({name,sha256:createHash('sha256').update(await readFile(out+'/'+name)).digest('hex')})));
await writeFile(out+'/manifest.json',JSON.stringify({base_sha256:expectedSha,modules},null,2));
console.log('Five-module isolated release built');
