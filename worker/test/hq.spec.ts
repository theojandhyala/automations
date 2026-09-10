import { afterEach, expect, it, vi } from 'vitest';
import hq from '../src/hq';
import { calculateBaseline } from '../src/lib/deadset-baseline';
import { collectDeadsetSource } from '../src/lib/deadset-source';
const baseline = calculateBaseline([], [], [], new Date('2026-09-09T12:00:00Z'));
afterEach(() => vi.unstubAllGlobals());
function environment(authorized = true) {
  const get = vi.fn(async () => null as unknown);
  const put = vi.fn();
  const fetch = vi.fn(async (_request: Parameters<Fetcher['fetch']>[0]) => new Response(JSON.stringify(authorized ? { email: 'owner@example.com' } : { error: 'unauthorized' }), { status: authorized ? 200 : 401 }));
  const unsupported = () => { throw new Error('Unexpected binding operation'); };
  const env: HqEnv = {
    AUTOMATIONS: { fetch, connect: unsupported },
    BASELINE: { get: get as KVNamespace['get'], put, list: async () => unsupported(), getWithMetadata: async () => unsupported(), delete: async () => unsupported() },
    ASSETS: { fetch: async () => new Response('app'), connect: unsupported },
    DEADSET_SOURCE_URL: 'https://fqfdygbveeztgxwkbmfi.supabase.co', DEADSET_SOURCE_KEY: 'test-secret',
  };
  return { env, get, put, fetch };
}
it('does not read private data before owner authentication succeeds', async () => {
  const { env, get } = environment(false);
  expect((await hq.fetch(new Request('https://hq.test/api/deadset/baselines'), env)).status).toBe(401);
  expect(get).not.toHaveBeenCalled();
});
it('returns only validated cached aggregates to the authenticated owner', async () => {
  const { env, get } = environment();
  get.mockResolvedValueOnce(baseline).mockResolvedValueOnce(null);
  const res = await hq.fetch(new Request('https://hq.test/api/deadset/baselines'), env);
  expect(await res.json()).toEqual({ current: baseline, previous: null });
  expect(res.headers.get('cache-control')).toBe('no-store');
});
it('preserves the old snapshot if source collection fails', async () => {
  const { env, put } = environment();
  vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })));
  const res = await hq.fetch(new Request('https://hq.test/api/deadset/refresh', { method: 'POST' }), env);
  expect(res.status).toBe(503); expect(put).not.toHaveBeenCalled();
});
it('reuses a recently collected snapshot', async () => {
  const { env, get, put } = environment();
  const current = { ...baseline, captured_at: new Date().toISOString() };
  get.mockResolvedValue(current);
  const res = await hq.fetch(new Request('https://hq.test/api/deadset/refresh', { method: 'POST' }), env);
  expect(await res.json()).toEqual({ current, cached: true }); expect(put).not.toHaveBeenCalled();
});
it('delegates actions with the owner token rather than inventing a privileged session', async () => {
  const { env, fetch } = environment();
  await hq.fetch(new Request('https://hq.test/api/artifacts/123', { method: 'PATCH', headers: { Authorization: 'Bearer owner-token' }, body: '{"status":"draft"}' }), env);
  const delegated = fetch.mock.calls[1]?.[0] as Request | undefined;
  expect(delegated?.url).toBe('https://automations.theojandhyala.workers.dev/api/artifacts/123');
  expect(delegated?.headers.get('Authorization')).toBe('Bearer owner-token');
  expect(await delegated?.text()).toBe('{"status":"draft"}');
});
it('protects public shell embedding and indexing without putting baseline data in assets', async () => {
  const { env } = environment();
  const res = await hq.fetch(new Request('https://hq.test/'), env);
  expect(res.headers.get('x-frame-options')).toBe('DENY');
  expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow');
  expect(await res.text()).toBe('app');
});
it('restricts source credentials to the configured Supabase HTTPS origin', async () => {
  const spy = vi.fn(); vi.stubGlobal('fetch', spy);
  await expect(collectDeadsetSource('https://supabase.co.attacker.test', 'secret')).rejects.toThrow();
  expect(spy).not.toHaveBeenCalled();
});
it('does not accept an unknown row count as an empty verified source', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('[]', { headers: { 'content-range': '0-0/*' } })));
  await expect(collectDeadsetSource('https://example.supabase.co', 'secret')).rejects.toThrow('coverage');
});
