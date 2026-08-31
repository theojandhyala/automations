#!/usr/bin/env node

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const WIDTH = 1080;
const HEIGHT = 1920;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function imageDataUrl(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${url}: ${response.status}`);
  const mime = response.headers.get('content-type')?.split(';')[0] || 'image/jpeg';
  const base64 = Buffer.from(await response.arrayBuffer()).toString('base64');
  return `data:${mime};base64,${base64}`;
}

function html(imageUrl, overlay, role) {
  const hook = role === 'hook';
  const fontSize = hook
    ? overlay.length > 80 ? 68 : overlay.length > 52 ? 78 : 90
    : overlay.length > 60 ? 54 : 64;
  const imageFit = hook ? 'cover' : 'contain';
  const position = hook ? 'center 43%' : 'center center';
  const overlayPosition = hook
    ? 'top:27%;left:70px;right:70px;'
    : 'bottom:150px;left:64px;right:64px;';
  const shade = hook
    ? 'linear-gradient(180deg,rgba(0,0,0,.18),rgba(0,0,0,.05) 46%,rgba(0,0,0,.24))'
    : 'linear-gradient(180deg,transparent 66%,rgba(0,0,0,.35))';
  return `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box}html,body{margin:0;width:${WIDTH}px;height:${HEIGHT}px;overflow:hidden;background:#06070a}
body{font-family:Arial,Helvetica,sans-serif;color:#fff}
.photo{position:absolute;inset:0;width:100%;height:100%;object-fit:${imageFit};object-position:${position};background:#06070a}
.shade{position:absolute;inset:0;background:${shade}}
.copy{position:absolute;${overlayPosition}text-align:center;font-size:${fontSize}px;font-weight:900;line-height:1.08;letter-spacing:-2px;color:#fff;text-shadow:-4px -4px 0 #000,4px -4px 0 #000,-4px 4px 0 #000,4px 4px 0 #000,0 6px 12px rgba(0,0,0,.55);overflow-wrap:anywhere}
</style></head><body><img class="photo" src="${imageUrl}"><div class="shade"></div><div class="copy">${escapeHtml(overlay)}</div></body></html>`;
}

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${basename(command)} failed: ${result.stderr || result.stdout}`);
}

async function screenshot(workDir, output, imageUrl, overlay, role) {
  const htmlPath = resolve(workDir, `${basename(output)}.html`);
  const pngPath = resolve(workDir, `${basename(output)}.png`);
  await writeFile(htmlPath, html(imageUrl, overlay, role));
  run(CHROME, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--force-device-scale-factor=1',
    `--window-size=${WIDTH},${HEIGHT}`,
    `--screenshot=${pngPath}`,
    pathToFileURL(htmlPath).href,
  ]);
  run('/usr/bin/sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '92', pngPath, '--out', output]);
}

const configPath = process.argv[2];
const outputDir = resolve(process.argv[3] || 'rendered-slides');
if (!configPath) throw new Error('Usage: render-local-slides.mjs <plan.json> [output-directory]');
const config = JSON.parse(await readFile(resolve(configPath), 'utf8'));
if (!Array.isArray(config.jobs) || config.jobs.length === 0) throw new Error('Plan needs a non-empty jobs array.');

await mkdir(outputDir, { recursive: true });
const workDir = await mkdtemp(resolve(tmpdir(), 'deadset-render-'));
try {
  for (const job of config.jobs) {
    const [hookImage, featureImage] = await Promise.all([
      imageDataUrl(job.hook_image_url),
      imageDataUrl(job.feature_image_url),
    ]);
    await screenshot(workDir, resolve(outputDir, `${job.name}-slide-1.jpg`), hookImage, job.hook, 'hook');
    await screenshot(workDir, resolve(outputDir, `${job.name}-slide-2.jpg`), featureImage, job.feature, 'feature');
  }
} finally {
  await rm(workDir, { recursive: true, force: true });
}

console.log(`Rendered ${config.jobs.length * 2} slides to ${outputDir}`);
