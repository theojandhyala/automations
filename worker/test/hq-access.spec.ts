import {Db} from '../src/lib/db';
import {describe,it,expect,vi} from 'vitest';
import {env} from 'cloudflare:test';
import {handleAppHq,loadHq} from '../src/api/app-hq';
import type {Env} from '../src/types';
import {boundedText} from '../src/lib/hq-apple';
describe('HQ private boundary',()=>{
 it('requires owner authentication for reads and report writes',async()=>{
 for(const [path,method] of [['deadset','GET'],['cast/import','POST'],['cast/settings','PUT'],['deadset/sync','POST']]){
 const res=await handleAppHq(new Request(`https://example.test/api/hq/${path}`,{method}),env as Env);
 expect(res.status).toBe(401);expect(res.headers.get('cache-control')).toBe('no-store');
 }
 });
 it('enforces streamed report size without relying on Content-Length',async()=>{await expect(boundedText(new Response('a'.repeat(101)).body,100)).rejects.toThrow('Report exceeds');});
});

it('loads app-scoped channel fields without the owner-JWT-only public view',async()=>{
 const select=vi.spyOn(Db.prototype,'select').mockImplementation(async (table,query)=>{
  if(table==='apps')return [{id:'cast-id'}];
  if(table==='tiktok_accounts'){expect(query).toBe('app_id=eq.cast-id&select=id,handle,status');return [{id:'cast-channel',handle:'cast.fishing.app',status:'connected'}];}
  if(table==='post_metrics')expect(query).toContain('account_id=in.(cast-channel)');
  expect(table).not.toBe('tiktok_accounts_public');return [];
 });
 try{const data=await loadHq(env as Env,'cast',7);expect(data.channels[0]?.handle).toBe('cast.fishing.app');expect(data.baseline).toBeNull();expect(data.errors).toEqual([]);}finally{select.mockRestore();}
});
