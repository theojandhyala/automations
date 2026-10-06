// Surgical extension of the exported live release: never rebuild the unrelated dirty checkout.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {build} from '../worker/node_modules/esbuild/lib/main.js';
const [base,out,expectedSha]=process.argv.slice(2);
let s=await readFile(base+'/index.js','utf8');
if(createHash('sha256').update(s).digest('hex')!==expectedSha)throw new Error('Live base mismatch');
function patch(a,b){if(s.split(a).length!==2)throw new Error('Ambiguous release anchor: '+a.slice(0,100));s=s.replace(a,b);}
s='import { MANAGED_BRANDS, isManagedBrand, publicRelease, newBrandReviewPrompt } from "./managed-brands.mjs";\nimport { createBrandStudioHandler } from "./new-brand-creative.mjs";\n'+s;
patch('promotion_enabled=eq.true&slug=in.(deadset,cast)&select=id,slug','slug=in.(deadset,cast,lifescore,reclaim)&select=id,slug');
patch('(app.slug === "deadset" ? "deadset.app" : "cast.fishing.app")','(isManagedBrand(app.slug) ? MANAGED_BRANDS[app.slug].handle : "")');
patch('return appSlug === "deadset" || appSlug === "cast";','return ["deadset","cast","lifescore","reclaim"].includes(appSlug);');
patch('function visualReviewVersion(artifact) {', 'function visualReviewVersion(artifact) {\nif(["lifescore","reclaim"].includes(String(artifact.asset_manifest.app_slug))) return CREATIVE_DIRECTION_VERSION+"-brand-critic-v2";');
patch('function finalImageReviewPrompt(artifact, index) {','function finalImageReviewPrompt(artifact, index) {\nconst specific = newBrandReviewPrompt(artifact,index); if(specific) return specific;');
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
