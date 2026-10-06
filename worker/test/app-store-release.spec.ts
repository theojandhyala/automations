import { describe,it,expect,vi,afterEach } from 'vitest';
import type { Env } from '../src/types';
vi.mock('../src/lib/hq-apple',()=>({appleCredentials:async()=>({})}));
vi.mock('../src/lib/app-store',()=>({appStoreToken:async()=>'test-only-token'}));
import { connectedAppleRelease } from '../src/lib/app-store-release';
afterEach(()=>vi.unstubAllGlobals());
const bindings={} as Env;
function replies(bodies:unknown[]){const f=vi.fn(async()=>Response.json(bodies.shift()));vi.stubGlobal('fetch',f);return f;}
const released={data:[{attributes:{appStoreState:'READY_FOR_SALE'}}]};
const availability={data:{id:'availability'}};
const territory=(attributes:Record<string,unknown>)=>({data:[{relationships:{territory:{data:{id:'GBR'}}},attributes}]});
describe('connected Apple release evidence',()=>{
 it('does not release an app waiting for review',async()=>{const f=replies([{data:[{attributes:{appStoreState:'WAITING_FOR_REVIEW'}}]}]);expect(await connectedAppleRelease(bindings,123)).toMatchObject({available:false,reason:expect.stringContaining('WAITING_FOR_REVIEW')});expect(f).toHaveBeenCalledTimes(1);});
 it('requires both a released version and available GB territory',async()=>{replies([released,availability,territory({available:true,preOrderEnabled:false,releaseDate:'2026-01-01'})]);expect((await connectedAppleRelease(bindings,123,Date.parse('2026-10-06'))).available).toBe(true);});
 it.each([{available:false},{available:true,preOrderEnabled:true},{available:true,releaseDate:'2099-01-01'}])('holds unavailable, preorder and future territory state %j',async attributes=>{replies([released,availability,territory(attributes)]);expect((await connectedAppleRelease(bindings,123)).available).toBe(false);});
 it('never forwards an Apple token to a foreign pagination link',async()=>{const f=replies([released,availability,{data:[],links:{next:'https://evil.test/collect'}}]);await expect(connectedAppleRelease(bindings,123)).rejects.toThrow('origin');expect(f).toHaveBeenCalledTimes(3);});
});
