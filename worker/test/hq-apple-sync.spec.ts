import { afterEach, expect, it, vi } from 'vitest';
import { env } from 'cloudflare:test';
import { appleSyncDates, syncApple } from '../src/lib/hq-apple';
import { downloadSummary } from '../src/lib/hq-report-summary';
import type { Env } from '../src/types';
vi.mock('../src/lib/app-store', () => ({ appStoreToken: async () => 'test-token' }));
vi.mock('../src/lib/crypto', () => ({ decrypt: async () => '{}' }));
vi.mock('../src/lib/db', () => ({ Db: class { async selectOne() { return { secret_enc: 'test' }; } } }));
afterEach(() => vi.unstubAllGlobals());
it('rechecks all recent dates and rotates through the entire 90-day window', () => {
  const start = Date.parse('2026-09-28T00:00:00Z');
  const dates = new Set<string>();
  for (let hour = 0; hour < 28; hour++) {
    const batch = appleSyncDates(start + hour * 3600000);
    expect(batch).toHaveLength(10);
    expect(new Set(batch).size).toBe(10);
    batch.forEach(d => dates.add(d));
  }
  expect(dates.has('2026-06-30')).toBe(true);
  expect(appleSyncDates(start)).toContain('2026-09-27');
  expect(appleSyncDates(start)).not.toContain('2026-09-28');
});
it('totals first downloads and re-downloads without making missing days zero', () => {
  expect(downloadSummary([{ date: '2026-09-01', downloads: 19, redownloads: 16 }, { date: '2026-09-02' }]))
    .toMatchObject({ value: 35, complete: false, received: 1 });
  expect(downloadSummary([{ date: '2026-09-01', downloads: 0, redownloads: 0 }, { date: '2026-09-02' }]).value).toBeNull();
});
it('retains a received nonzero report when Apple temporarily returns no sales and continues after a network failure', async () => {
  const kv = env.HQ_DATA;
  await kv.put('cast/apple-settings', JSON.stringify({ apple_app_id: '123456789', sku: 'CastSKU', vendor_number: '12345678' }));
  const date = appleSyncDates()[0]!;
  const key = `cast/day/app_store_connect/${date}`;
  const previous = { source: 'app_store_connect', description: 'Apple daily Summary Sales report', captured_at: '2026-09-01T00:00:00Z', data: { date, downloads: 9, redownloads: 2 } };
  await kv.put(key, JSON.stringify(previous));
  let calls = 0;
  vi.stubGlobal('fetch', vi.fn(async () => {
    calls++;
    if (calls === 2) throw new Error('network failure');
    return new Response(JSON.stringify({ errors: [{ code: 'NOT_FOUND', detail: 'There were no sales for the date specified.' }] }), { status: 404 });
  }));
  const result = await syncApple(env as Env, 'cast');
  expect(calls).toBe(10);
  expect(result.saved).toBe(8);
  expect(result.errors).toHaveLength(2);
  expect(await kv.get(key, 'json')).toEqual(previous);
});
