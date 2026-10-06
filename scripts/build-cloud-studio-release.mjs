// Build only the reviewed Cloud Studio changes onto an exported production module.
// Refuses unexpected release layouts. Keeps the deployed dashboard and all other code intact.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {build} from '../worker/node_modules/esbuild/lib/main.js';
const [base,out,expectedSha]=process.argv.slice(2);
if(!base||!out||!expectedSha)throw new Error('Usage: node scripts/build-cloud-studio-release.mjs <live-module> <output-dir> <expected-sha256>');
let source=await readFile(base,'utf8');
if(createHash('sha256').update(source).digest('hex')!==expectedSha)throw new Error('Unexpected live release hash');
function replace(before,after){if(source.split(before).length!==2)throw new Error('Release anchor missing or ambiguous: '+before.slice(0,100));source=source.replace(before,after);}
source='import { cloudWorkGate, claimCreativeAttempt, handleCloudStudio, postingHealth } from "./cloud-studio.mjs";\nimport { CLOUD_STUDIO_PAGE } from "./cloud-studio-page.mjs";\n'+source;
replace('var BY_KEY = new Map(HANDLERS.map((h) => [h.key, h]));',`var BY_KEY = new Map(HANDLERS.map((h) => [h.key, { ...h, async run(ctx) {
const hold = await cloudWorkGate(ctx);
if (hold) { ctx.log('warn', 'cloud preparation held', { reason: hold }); return { held: true, reason: hold }; }
return h.run(ctx);
} }]));`);
replace('if (previous?.version === visualReviewVersion(artifact) && previous.fingerprint === await creativeFingerprint(artifact) && Date.now() - Date.parse(previous.at ?? "") < 24 * 36e5)',
'if (previous?.version === visualReviewVersion(artifact) && previous.fingerprint === await creativeFingerprint(artifact) && (!artifact.asset_manifest.visual_review.blockers?.some(b => b.startsWith("Visual review unavailable:")) || Date.now() - Date.parse(previous.at ?? "") < 24 * 36e5))');
replace('    const pending = candidates.filter((artifact) => !deliveryPaused(artifact)).filter(',`    const unchangedRejections = new Set();
    for (const artifact of candidates) {
      const review = artifact.asset_manifest.visual_review;
      if (review?.pass === false && review.version === visualReviewVersion(artifact)
        && review.fingerprint === await creativeFingerprint(artifact)
        && !review.blockers?.some(b => b.startsWith("Visual review unavailable:"))) unchangedRejections.add(artifact.id);
    }
    const pending = candidates.filter(artifact => !unchangedRejections.has(artifact.id)).filter((artifact) => !deliveryPaused(artifact)).filter(`);
replace('      const reason = await preflightArtifact(\n',`      if (!await claimCreativeAttempt(ctx.env, artifact, CAPTION_RENDERER_VERSION)) {
        ctx.log("warn", "unchanged creative held; revise inputs before retry", { artifact_id: artifact.id });
        continue;
      }
      const reason = await preflightArtifact(
`);
replace('  if (path === "/auth/session" && req.method === "GET") {','  if (path === "/cloud-studio") return handleCloudStudio(req, env, hasPassingVisualReview);\n  if (path === "/auth/session" && req.method === "GET") {');
replace('    if (url.pathname.startsWith("/api/hq/")) return handleAppHq(req, env, ctx);','    if (url.pathname === "/cloud-studio" || url.pathname === "/api/cloud-studio/view") return new Response(CLOUD_STUDIO_PAGE, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });\n    if (url.pathname.startsWith("/api/hq/")) return handleAppHq(req, env, ctx);');
replace('select=id,handle,display_name,app_id,status&order=created_at.asc','select=id,handle,display_name,app_id,status,health&order=created_at.asc');
replace('      const connectedAccount = appAccounts.some((account) => account.status === "connected");', '      const connectedAccount = appAccounts.some((account) => account.status === "connected");\n      const liveAccessReady = appAccounts.some(account => account.status === "connected" && postingHealth(account.health ?? {}).ready);');
replace('      if (!developerAppApproved) blockers.push(', '      if (!liveAccessReady) blockers.push("Live TikTok access is blocked or unverified. Check account health in Cloud Studio.");\n      if (!developerAppApproved) blockers.push(');
replace('connectedAccount && developerAppApproved),','connectedAccount && developerAppApproved && liveAccessReady),');
replace('  const releasedOrBooked = recent.filter((r) => !r.status || ["approved", "publishing", "published"].includes(r.status));','  const releasedOrBooked = recent;');
await mkdir(out,{recursive:true});
await writeFile(out+'/index.js',source);
for(const module of ['cloud-studio','cloud-studio-page'])await build({entryPoints:['worker/src/lib/'+module+'.ts'],bundle:true,format:'esm',target:'es2022',outfile:out+'/'+module+'.mjs'});
await writeFile(out+'/manifest.json',JSON.stringify({base_sha256:expectedSha,modules:await Promise.all(['index.js','cloud-studio.mjs','cloud-studio-page.mjs'].map(async name=>({name,sha256:createHash('sha256').update(await readFile(out+'/'+name)).digest('hex')})))},null,2));
console.log('Built isolated Cloud Studio release:',out);
