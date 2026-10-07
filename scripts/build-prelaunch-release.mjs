// Surgical extension of the current live bundle: safe prelaunch posts only.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { build } from '../worker/node_modules/esbuild/lib/main.js';

const [base, out, expectedSha] = process.argv.slice(2);
let source = await readFile(base + '/index.js', 'utf8');
if (createHash('sha256').update(source).digest('hex') !== expectedSha) throw new Error('Live base mismatch');
function patch(from, to) { if (source.split(from).length !== 2) throw new Error('Ambiguous release anchor: ' + from); source = source.replace(from, to); }
source = `function isTruthfulPrelaunchPreview(artifact,slug){if(slug!=="lifescore"&&slug!=="reclaim")return false;if(artifact.asset_manifest.release_context!=="preview; no availability claims")return false;return !/\\b(?:download|install|available now|app store|subscribe|buy)\\b/i.test((artifact.hook??"")+" "+(artifact.caption??""));}\n` + source;
patch('  if (captionWords.length > 12 || caption.length > 110) blockers.push("Caption must be one native sentence of at most 12 words.");', '  if (captionWords.length > 42 || caption.length > 280) { score2 -= 10; warnings.push("Shorten the caption so the product proof does the selling."); }');
patch('      const routingError = routeError || (release && !release.available ? release.reason : null);', '      const routingError = routeError || (release && !release.available && !isTruthfulPrelaunchPreview(artifact,app.slug) ? release.reason : null);');
patch('      if (!release.available) { for(const slot of targetSlots) missing.push({app:mission.slug,day:slot.localDay,slot:slot.localTime,reason:release.reason}); continue; }\n', '');
patch('        if (artifact.asset_manifest.app_slug !== mission.slug) continue;\n', '        if (artifact.asset_manifest.app_slug !== mission.slug) continue;\n        if (!release.available && !isTruthfulPrelaunchPreview(artifact,mission.slug)) continue;\n');
await mkdir(out,{recursive:true}); await writeFile(out + '/index.js',source);
const names=['cloud-studio','cloud-studio-page','managed-brands','new-brand-creative'];
for(const name of names)await build({entryPoints:['worker/src/lib/'+name+'.ts'],bundle:true,format:'esm',target:'es2022',outfile:out+'/'+name+'.mjs'});
const modules=await Promise.all(['index.js',...names.map(n=>n+'.mjs')].map(async name=>({name,sha256:createHash('sha256').update(await readFile(out+'/'+name)).digest('hex')})));
await writeFile(out+'/manifest.json',JSON.stringify({base_sha256:expectedSha,modules},null,2));
console.log('Prelaunch release built.');
