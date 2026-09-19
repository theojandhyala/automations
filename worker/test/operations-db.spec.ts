import { env } from 'cloudflare:test';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { OperationsDb, operationsWhere } from '../src/lib/operations-db';
import schema from '../migrations/0001_operations.sql?raw';

declare global { namespace Cloudflare { interface Env { TEST_OPERATIONS_DB:D1Database } } }
const binding=env.TEST_OPERATIONS_DB;
const now='2026-09-19T09:00:01.000Z';
let db:OperationsDb;
beforeAll(async()=>{for(const sql of schema.split(';').map(s=>s.trim()).filter(Boolean))await binding.prepare(sql).run();});
beforeEach(async()=>{
 await binding.batch(['tiktok_delivery_slots','post_metrics','analytics_snapshots','promotion_missions','artifacts','daily_reports','run_events','runs','automations','creative_assets','tiktok_accounts','apps','settings','integration_secrets'].map(t=>binding.prepare(`DELETE FROM ${t}`)));
 db=new OperationsDb(binding,()=>new Date(now));
 await db.insert('apps',{id:'app',slug:'deadset',name:'Deadset'});
 await db.insert('tiktok_accounts',{id:'account',handle:'@deadset.app',app_id:'app',status:'connected',daily_post_limit:5});
});
const artifact=(id:string,extra:Record<string,unknown>={})=>db.insert<Record<string,unknown>>('artifacts',{id,app_id:'app',account_id:'account',status:'approved',caption:'Original',asset_manifest:{app_slug:'deadset',production:{a:1,b:2}},...extra});
const reserve=(id:string,expected:Record<string,unknown>={caption:'Original'},scheduled=true)=>db.rpc<boolean>('reserve_tiktok_delivery',{p_artifact_id:id,p_scheduled:scheduled,p_expected:expected});

describe('D1 operations data',()=>{
 it('roundtrips nested JSON, booleans, generated IDs and canonical timestamps',async()=>{
  const r=await artifact('a',{asset_manifest:{z:[{b:2,a:1}],app_slug:'deadset'},published_at:'2026-09-19T10:00:00+01:00',auto_add_music:true});
  expect(r.published_at).toBe('2026-09-19T09:00:00.000Z');expect(r.auto_add_music).toBe(true);
  expect(r.asset_manifest).toEqual({app_slug:'deadset',z:[{a:1,b:2}]});
  const generated=await db.insert<{id:string;created_at:string}>('artifacts',{app_id:'app'});expect(generated.id).toMatch(/^[\da-f-]{36}$/);expect(generated.created_at).toBe(now);
  expect(await db.select('artifacts','asset_manifest->>app_slug=eq.deadset&auto_add_music=eq.true&select=id')).toEqual([{id:'a'}]);
 });
 it('matches JSON regardless of key order, preserves null filtering and defaults',async()=>{
  await artifact('a');
  const q='asset_manifest=eq.'+encodeURIComponent(JSON.stringify({production:{b:2,a:1},app_slug:'deadset'}));
  expect((await db.select('artifacts',q)).length).toBe(1);
  expect((await db.select('artifacts','or=(publish_id.is.null,status.eq.failed)&status=in.(approved,draft)')).length).toBe(1);
  expect(await db.select('artifacts','publish_id=not.is.null')).toEqual([]);
  expect((await db.selectOne<{auto_add_music:boolean}>('artifacts','id=eq.a'))?.auto_add_music).toBe(false);
 });
 it('keeps parameter values as data and refuses tables, columns and operators outside the schema',async()=>{
  await artifact('a',{caption:"x' OR 1=1 --"});await artifact('b');
  expect(await db.select('artifacts','caption=eq.'+encodeURIComponent("x' OR 1=1 --")+'&select=id')).toEqual([{id:'a'}]);
  for(const query of ['id=like.%','id=eq.x&order=id.desc;DROP','asset_manifest->bad-key=eq.x','select=access_token_enc'])await expect(db.select('artifacts',query)).rejects.toThrow();
  expect(()=>operationsWhere('evil',new URLSearchParams('id=eq.a'))).toThrow();
  await expect(db.select('artifacts','limit=-1')).rejects.toThrow();
 });
 it('applies conflict updates and real foreign keys without duplicate rows',async()=>{
  await db.upsert('settings',{key:'x',value:{a:1}},'key');await db.upsert('settings',{key:'x',value:{a:2}},'key');
  expect(await db.select('settings','select=key,value')).toEqual([{key:'x',value:{a:2}}]);
  await expect(artifact('a',{account_id:'missing'})).rejects.toThrow();
 });
 it('keeps account ciphertext out of the public relation',async()=>{
  await db.update('tiktok_accounts','id=eq.account',{access_token_enc:'encrypted'});
  const r=await db.selectOne<Record<string,unknown>>('tiktok_accounts_public');expect(r).not.toHaveProperty('access_token_enc');
  await expect(db.select('tiktok_accounts_public','select=access_token_enc')).rejects.toThrow();
 });
});

describe('atomic claims',()=>{
 it('partitions concurrent dispatchers and reclaims only expired claims',async()=>{
  for(const id of ['one','two'])await db.insert('automations',{id,name:id,handler_key:'heartbeat',cron:'* * * * *',enabled:true,next_run_at:'2026-09-19T08:00:00Z'});
  const results=await Promise.all(Array.from({length:8},()=>db.rpc<{id:string}[]>('claim_due_automations',{p_limit:1})));
  expect(results.flat().map(r=>r.id).sort()).toEqual(['one','two']);
  expect(await db.rpc('claim_automation',{p_id:'one'})).toEqual([]);
  await db.update('automations','id=eq.one',{running_since:'2026-09-19T08:44:59Z'});
  expect((await db.rpc<unknown[]>('claim_automation',{p_id:'one'})).length).toBe(1);
 });
 it('locks account refresh once and never claims disabled automations',async()=>{
  await db.insert('automations',{id:'a',name:'a',handler_key:'heartbeat',enabled:true,status:'disabled'});
  expect(await db.rpc('claim_automation',{p_id:'a'})).toEqual([]);
  const claims=await Promise.all(Array.from({length:6},()=>db.rpc<unknown[]>('claim_tiktok_refresh',{p_account_id:'account'})));
  expect(claims.flat().length).toBe(1);
 });
});

describe('delivery reservations',()=>{
 it('reserves exactly once across concurrent requests and flips the artifact in the same transaction',async()=>{
  await artifact('a');const results=await Promise.all(Array.from({length:10},()=>reserve('a')));
  expect(results.filter(Boolean)).toHaveLength(1);
  expect((await db.selectOne<{status:string;stage:string}>('artifacts','id=eq.a'))).toMatchObject({status:'publishing',stage:'publish'});
  expect(await db.select('tiktok_delivery_slots','select=artifact_id,local_day,slot')).toEqual([{artifact_id:'a',local_day:'2026-09-19',slot:'10'}]);
 });
 it('does not flip a loser or duplicate another artifact in the same slot',async()=>{
  await artifact('a');await artifact('b');expect(await reserve('a')).toBe(true);
  await db.update('artifacts','id=eq.a',{status:'published',published_at:now});expect(await reserve('b')).toBe(false);
  expect((await db.selectOne<{status:string}>('artifacts','id=eq.b'))?.status).toBe('approved');
 });
 it('rejects stale reviewed content and preserves both records on failure',async()=>{
  await artifact('a');expect(await reserve('a',{caption:'Changed'})).toBe(false);expect(await reserve('a',{})).toBe(false);
  expect(await db.select('tiktok_delivery_slots')).toEqual([]);expect((await db.selectOne<{status:string}>('artifacts','id=eq.a'))?.status).toBe('approved');
 });
 it('accepts canonical exact reviewed JSON and rejects modified nested content',async()=>{
  await artifact('a');expect(await reserve('a',{asset_manifest:{production:{a:9,b:2},app_slug:'deadset'}})).toBe(false);
  expect(await reserve('a',{asset_manifest:{production:{b:2,a:1},app_slug:'deadset'}})).toBe(true);
 });
 it('rejects wrong handles, paused brands, cross-account destinations and future dates',async()=>{
  await artifact('a');
  await db.update('tiktok_accounts','id=eq.account',{handle:'wrong'});expect(await reserve('a')).toBe(false);
  await db.update('tiktok_accounts','id=eq.account',{handle:'deadset.app'});
  await db.update('apps','id=eq.app',{promotion_enabled:false});expect(await reserve('a')).toBe(false);
  await db.update('apps','id=eq.app',{promotion_enabled:true});
  await db.update('artifacts','id=eq.a',{asset_manifest:{app_slug:'cast'}});expect(await reserve('a')).toBe(false);
  await db.update('artifacts','id=eq.a',{asset_manifest:{app_slug:'deadset'},scheduled_for:'2026-09-20T00:00:00Z'});expect(await reserve('a')).toBe(false);
 });
 it('counts reservations and historical publications once and enforces five',async()=>{
  for(let i=0;i<5;i++){const id='a'+i;await artifact(id);expect(await reserve(id,undefined,false)).toBe(true);await db.update('artifacts','id=eq.'+id,{status:'published',published_at:now});}
  await artifact('six');expect(await reserve('six',undefined,false)).toBe(false);expect((await db.select('tiktok_delivery_slots')).length).toBe(5);
 });
 it('honours a lower account cap and unresolved publishing submissions',async()=>{
  await artifact('a');await artifact('b');expect(await reserve('a',undefined,false)).toBe(true);expect(await reserve('b',undefined,false)).toBe(false);
  await db.update('artifacts','id=eq.a',{status:'published',published_at:now});await db.update('tiktok_accounts','id=eq.account',{daily_post_limit:1});expect(await reserve('b',undefined,false)).toBe(false);
 });
 it.each([
  ['2026-03-29T09:00:00Z','10',true],['2026-10-25T10:00:00Z','10',true],['2026-09-19T17:30:00Z','18:30',true],['2026-09-19T09:05:00Z','',false],['2026-09-19T08:59:59Z','',false],
 ])('uses London slots at %s',async(at,slot,ok)=>{
  db=new OperationsDb(binding,()=>new Date(at));await artifact('a');expect(await reserve('a')).toBe(ok);
  const result=await db.selectOne<{slot:string}>('tiktok_delivery_slots');expect(result?.slot??'').toBe(slot);
 });
});

it('configures all five slots atomically and refuses an incomplete brand pipeline',async()=>{
 await db.insert('automations',{id:'publisher',name:'Publish',handler_key:'tiktok.publish',enabled:true,config:{local_hours:[12,15,18]}});
 await expect(db.rpc('configure_five_daily_posting')).rejects.toThrow();
 expect((await db.selectOne<{config:unknown}>('automations','id=eq.publisher'))?.config).toEqual({local_hours:[12,15,18]});
 await db.insert('apps',{id:'cast',slug:'cast',name:'Cast'});
 await db.insert('tiktok_accounts',{id:'cast-account',app_id:'cast',handle:'cast.fishing.app',status:'connected',daily_post_limit:3});
 for(const slug of ['deadset','cast'])for(const handler of ['tiktok.generate','tiktok.produce'])await db.insert('automations',{id:slug+handler,name:handler,handler_key:handler,enabled:true,config:{app_slug:slug}});
 expect(await db.rpc('configure_five_daily_posting')).toMatchObject({daily_post_limit:5,local_times:['10:00','12:00','14:00','16:00','18:30']});
 expect((await db.selectOne<{config:unknown}>('automations','id=eq.publisher'))?.config).toEqual({timezone:'Europe/London',local_times:['10:00','12:00','14:00','16:00','18:30']});
 expect(await db.select('tiktok_accounts','daily_post_limit=eq.5&select=id')).toHaveLength(2);
});

it('serves bounded dashboard reads and counts without exposing secret relations',async()=>{
 const { readOwnerData }=await import('../src/lib/owner-data');
 const { Db }=await import('../src/lib/db');
 const facade=new Db({...env,OPERATIONS_DB:binding} as any);
 await artifact('one');await artifact('two',{status:'draft'});
 const res=await readOwnerData(new Request('https://example.test/api/data/artifacts?status=eq.draft&select=id',{headers:{Prefer:'count=exact'}}),facade,'artifacts');
 expect(res.headers.get('Content-Range')).toBe('0-0/1');expect(await res.json()).toEqual([{id:'two'}]);
 for(const t of ['tiktok_accounts','integration_secrets','settings','evil'])expect((await readOwnerData(new Request('https://example.test/api/data/'+t),facade,t)).status).toBe(404);
 expect((await readOwnerData(new Request('https://example.test/api/data/apps?limit=5000'),facade,'apps')).status).toBe(400);
 const missing=await readOwnerData(new Request('https://example.test/api/data/apps?id=eq.absent',{headers:{Accept:'application/vnd.pgrst.object+json'}}),facade,'apps');expect(missing.status).toBe(406);
});
