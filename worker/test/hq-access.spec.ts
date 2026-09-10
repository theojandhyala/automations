import {describe,it,expect} from 'vitest';
import {env} from 'cloudflare:test';
import {handleAppHq} from '../src/api/app-hq';
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
