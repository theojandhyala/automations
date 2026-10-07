// Adds a release-boundary wellbeing creative contract to the current live bundle.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { build } from '../worker/node_modules/esbuild/lib/main.js';

const [base, out, expectedSha] = process.argv.slice(2);
let source = await readFile(base + '/index.js', 'utf8');
if (createHash('sha256').update(source).digest('hex') !== expectedSha) throw new Error('Live base mismatch');
function patch(from, to) {
  if (source.split(from).length !== 2) throw new Error('Ambiguous release anchor: ' + from.slice(0, 100));
  source = source.replace(from, to);
}

source = `const WELLBEING_APP_CLAIMS=/\\b(?:cure|treat(?:ment)?|therapy|diagnos(?:e|is)|guarantee(?:d)?|proven|quit|detox|withdrawal|days? sober|replace professional help)\\b/i;
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
` + source;
patch('  if (manifest.format === DEADSET_LONGFORM) {', '  blockers.push(...wellbeingCreativeBlockers(input,hook,caption,manifest));\n  if (manifest.format === DEADSET_LONGFORM) {');

await mkdir(out, { recursive: true });
await writeFile(out + '/index.js', source);
const names = ['cloud-studio', 'cloud-studio-page', 'managed-brands', 'new-brand-creative'];
for (const name of names) await build({ entryPoints: ['worker/src/lib/' + name + '.ts'], bundle: true, format: 'esm', target: 'es2022', outfile: out + '/' + name + '.mjs' });
const modules = await Promise.all(['index.js', ...names.map(name => name + '.mjs')].map(async name => ({
  name, sha256: createHash('sha256').update(await readFile(out + '/' + name)).digest('hex'),
})));
await writeFile(out + '/manifest.json', JSON.stringify({ base_sha256: expectedSha, modules }, null, 2));
console.log('Quality-contract release built.');
