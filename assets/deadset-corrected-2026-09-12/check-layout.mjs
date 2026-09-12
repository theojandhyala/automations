import fs from 'node:fs';
import { chromium } from '/Users/theojandhyala/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import { deadsetSlideHtml } from '../../worker/src/lib/deadset-slide-layout.ts';
const root=new URL('.',import.meta.url).pathname;
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const page=await browser.newPage({viewport:{width:1080,height:1920}});
const results=[];
async function check(name,selector){
 const boxes=await page.locator(selector).evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return {class:el.className,x:r.x,y:r.y,w:r.width,h:r.height,bottom:r.bottom,center:r.x+r.width/2,overflow:!el.classList.contains('proof-viewport')&&(el.scrollHeight>el.clientHeight+1||el.scrollWidth>el.clientWidth+1)}}));
 for(const b of boxes)if(Math.abs(b.center-540)>1||b.x<162||b.x+b.w>919||b.y<230||b.bottom>1440||b.overflow)throw Error(name+JSON.stringify(b));
 for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){const a=boxes[i],b=boxes[j];if(a.y<b.bottom&&b.y<a.bottom)throw Error(name+' overlap '+a.class+' / '+b.class);}
 results.push({name,boxes});
}
for(let i=1;i<=10;i++){await page.goto('file://'+root+`slide-${String(i).padStart(2,'0')}.html`);await page.evaluate(()=>document.fonts.ready);await check('long-'+i,'.words,.proof-title,.brand-lockup,.proof-viewport');}
await page.route('https://automations.theojandhyala.workers.dev/**',async route=>{let u=route.request().url();let f=u.endsWith('deadset-lockup.png')?'deadset-lockup.png':u.includes('fcb7b786')?'logger.png':'train.png';await route.fulfill({contentType:'image/png',body:fs.readFileSync(root+'sources/'+f)});});
for(const [featureKey,id,title]of[['live_logger','fcb7b786-5459-4edb-b575-7d9932fe7edb','See your planned sets and reps.'],['workout_plan','b8570478-36b1-49fa-8cdf-c90341bad79f','Training days. Rest days. Sorted.']]){
 await page.setContent(deadsetSlideHtml({imageUrl:`https://automations.theojandhyala.workers.dev/media/features/deadset/${featureKey}/${id}.png`,overlay:title,role:'feature',featureKey}));await page.waitForFunction(()=>Array.from(document.images).every(i=>i.complete&&i.naturalWidth));await check('production-'+featureKey,'.centered');await page.screenshot({path:root+'production-'+featureKey+'.jpg',type:'jpeg',quality:94});
}
fs.writeFileSync(root+'layout-check.json',JSON.stringify(results,null,2));await browser.close();console.log('12 slides: centred, safe bounds, no copy overlaps or text overflow.');
