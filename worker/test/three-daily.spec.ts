import { describe, expect, it, vi } from 'vitest';
import { applyThreeDaily } from '../src/lib/three-daily';
import type { Db } from '../src/lib/db';

function fixture(wrong = false) {
  const select = vi.fn(async (table: string) => table === 'apps' ? [{id:'d',slug:'deadset'},{id:'c',slug:'cast'}] : table === 'tiktok_accounts' ? [{id:'ad',app_id:'d',handle:wrong?'wrong':'@deadset.app'},{id:'ac',app_id:'c',handle:'cast.fishing.app'}] : [{id:'p',handler_key:'tiktok.publish',config:{max_per_run:3,local_hours:[12,15,18,21]}},{id:'gd',handler_key:'tiktok.generate',config:{app_slug:'deadset',count:4,extra_context:'preserved'}},{id:'gc',handler_key:'tiktok.generate',config:{app_slug:'cast',count:4}},{id:'gl',handler_key:'tiktok.generate',config:{app_slug:'lifescore',count:4}}]);
  const update=vi.fn(async()=>[{id:'saved'}]);
  return { select, update, db:{select,update} as unknown as Pick<Db,'select'|'update'> };
}
describe('three posts per brand daily',()=>{
  it('reduces atomic account caps first, preserves unrelated settings and leaves LifeScore alone',async()=>{
    const f=fixture();const r=await applyThreeDaily(f.db);
    expect(r.local_hours).toEqual([12,15,18]);
    const calls=f.update.mock.calls as unknown as Array<[string,string,any]>;
    expect(calls.slice(0,2).map(c=>c[0])).toEqual(['tiktok_accounts','tiktok_accounts']);
    expect(calls.slice(0,2).every(c=>c[2].daily_post_limit===3)).toBe(true);
    expect(calls.find(c=>c[1].startsWith('id=eq.p&'))?.[2]).toEqual({config:{max_per_run:3,local_hours:[12,15,18],timezone:'Europe/London'}});
    expect(calls.find(c=>c[1].startsWith('id=eq.gd&'))?.[2].config.extra_context).toBe('preserved');
    expect(calls.some(c=>c[1].startsWith('id=eq.gl&')||c[0]==='artifacts')).toBe(false);
  });
  it('refuses to write when a brand account does not match',async()=>{
    const f=fixture(true);await expect(applyThreeDaily(f.db)).rejects.toThrow('matching');expect(f.update).not.toHaveBeenCalled();
  });
});
