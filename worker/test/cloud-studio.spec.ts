import { planCastEditorial } from '../src/lib/cast-editorial';
import { env } from 'cloudflare:test';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import schema from '../migrations/0001_operations.sql?raw';
import cloudSchema from '../migrations/0002_cloud_studio.sql?raw';
import { cloudWorkGate, claimCreativeAttempt, creativeInputHash, handleCloudStudio, londonDay, postingHealth } from '../src/lib/cloud-studio';
import type { Artifact, Env } from '../src/types';
import type { RunContext } from '../src/lib/runner';
const db=env.TEST_OPERATIONS_DB;
const bindings={...env,OPERATIONS_DB:db} as unknown as Env;
beforeAll(async()=>{for(const sql of (schema+cloudSchema).split(';').map(s=>s.trim()).filter(Boolean)) await db.prepare(sql).run();});
beforeEach(async()=>{
 await db.batch(['cloud_studio_work','cloud_studio_attempts','artifacts','tiktok_accounts','apps','cloud_studio_control'].map(t=>db.prepare(`DELETE FROM ${t}`)));
 await db.prepare("INSERT INTO apps(id,slug,name) VALUES('app','deadset','Deadset')").run();
 await db.prepare("INSERT INTO cloud_studio_control VALUES('deadset',0,'now')").run();
});
const ctx=(id:string,kind='tiktok.generate')=>({env:bindings,runId:id,automation:{handler_key:kind,config:{app_slug:'deadset'}}} as unknown as RunContext);
const candidate=()=>({id:'a',app_id:'app',account_id:'account',hook:'Original hook',caption:'Original',hashtags:[],photo_urls:[],asset_manifest:{app_slug:'deadset',slides:[{overlay:'Original'}]}} as unknown as Artifact);
describe('cloud preparation safety',()=>{
 it('does not recycle a rejected Cast topic under a new artifact id',()=>{
  const first=planCastEditorial([],1)[0]!;
  for(const status of ['draft','failed','rejected']) {
   const next=planCastEditorial([{hook:first.hook,status,asset_manifest:{editorial_id:first.id,visual_review:{pass:false}}}],1);
   expect(next[0]?.id).not.toBe(first.id);
  }
 });
 it('admits only two concept runs across racing requests and never resets on retry',async()=>{
  const results=await Promise.all(Array.from({length:10},(_,i)=>cloudWorkGate(ctx('run-'+i))));
  expect(results.filter(r=>r===null)).toHaveLength(2);
  expect(await cloudWorkGate(ctx('run-0'))).not.toBeNull();
  expect(await db.prepare('SELECT count(*) n FROM cloud_studio_work').first('n')).toBe(2);
 });
 it('stops paused brands before consuming work',async()=>{
  await db.prepare("UPDATE cloud_studio_control SET paused=1 WHERE app_slug='deadset'").run();
  expect(await cloudWorkGate(ctx('run'))).toContain('paused');
  expect(await db.prepare('SELECT count(*) n FROM cloud_studio_work').first('n')).toBe(0);
 });
 it('holds generation when six untouched drafts already await rendering',async()=>{
  for(let i=0;i<6;i++)await db.prepare("INSERT INTO artifacts(id,app_id,status) VALUES(?,'app','draft')").bind('a'+i).run();
  expect(await cloudWorkGate(ctx('run'))).toContain('unrendered');
 });
 it('does not let new output URLs or critique timestamps buy another render',async()=>{
  const a=candidate(); expect(await claimCreativeAttempt(bindings,a,'v1')).toBe(true);
  a.photo_urls=['https://example.test/new.jpg'];a.asset_manifest.production={rendered_at:'later'};a.asset_manifest.visual_review={at:'later',pass:false};
  expect(await claimCreativeAttempt(bindings,a,'v1')).toBe(false);
  a.hook='A revised idea';expect(await claimCreativeAttempt(bindings,a,'v1')).toBe(true);
  expect(await creativeInputHash(a,'v2')).not.toBe(await creativeInputHash(a,'v1'));
 });
 it('has one winner for a racing exact render claim',async()=>{
  expect((await Promise.all(Array.from({length:8},()=>claimCreativeAttempt(bindings,candidate(),'v1')))).filter(Boolean)).toHaveLength(1);
 });
 it('does not accept stale or future health as posting permission',()=>{
  const now=Date.parse('2026-10-06T20:00:00Z');
  expect(postingHealth({posting_ready:true,checked_at:'2026-10-06T10:00:00Z'},now).ready).toBe(false);
  expect(postingHealth({posting_ready:true,checked_at:'2026-10-07T10:00:00Z'},now).ready).toBe(false);
  expect(postingHealth({posting_ready:true,checked_at:'2026-10-06T19:00:00Z'},now).ready).toBe(true);
  expect(londonDay(new Date('2026-10-06T23:30:00Z'))).toBe('2026-10-07');
 });
 it('rejects cross-origin control requests and unsupported brands',async()=>{
  const request=(origin:string,app='deadset')=>new Request('https://example.test/api/cloud-studio',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({app,action:'pause'})});
  expect((await handleCloudStudio(request('https://evil.test'),bindings,async()=>false)).status).toBe(403);
  expect((await handleCloudStudio(request('https://example.test','lifescore'),bindings,async()=>false)).status).toBe(400);
  expect((await handleCloudStudio(request('https://example.test'),bindings,async()=>false)).status).toBe(200);
  expect(await db.prepare("SELECT promotion_enabled FROM apps WHERE slug='deadset'").first('promotion_enabled')).toBe(0);
  expect(await cloudWorkGate(ctx('run'))).toContain('paused');
 });
});
