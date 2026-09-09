import { afterEach, expect, it, vi } from 'vitest';
import { handleDeadset } from '../src/api/deadset';
import { calculateBaseline } from '../src/lib/deadset-baseline';
import { apiRequest, authRoute, OTHER_TOKEN, stubFetch, testEnv, jsonResponse } from './helpers';
afterEach(() => vi.unstubAllGlobals());
it('rejects unauthenticated and non-owner requests', async () => {
  stubFetch([authRoute]);
  expect((await handleDeadset(apiRequest('/deadset/baselines', { token: null }), testEnv)).status).toBe(401);
  expect((await handleDeadset(apiRequest('/deadset/baselines', { token: OTHER_TOKEN }), testEnv)).status).toBe(401);
});
it('rejects oversized bodies and malformed imports before writing', async () => {
  stubFetch([authRoute]);
  const oversized = apiRequest('/deadset/baselines', { method: 'POST', body: 'x'.repeat(64001) });
  expect((await handleDeadset(oversized, testEnv)).status).toBe(413);
  expect((await handleDeadset(apiRequest('/deadset/baselines', { method: 'POST', body: JSON.stringify({ version: 1, registered_users: -1 }) }), testEnv)).status).toBe(400);
});
it('stores only validated aggregates', async () => {
  const baseline = calculateBaseline([], [], [], new Date('2026-09-01T00:00:00Z'));
  let inserted = false;
  stubFetch([authRoute, { match: /\/deadset_baselines/, respond: call => {
    if (call.method === 'POST') {
      const body = call.body as { payload: unknown };
      expect(body.payload).toEqual(baseline); inserted = true;
      return jsonResponse([{ id: 'saved' }]);
    }
    return jsonResponse([]);
  } }]);
  const response = await handleDeadset(apiRequest('/deadset/baselines', { method: 'POST', body: JSON.stringify(baseline) }), testEnv);
  expect(response.status).toBe(201); expect(inserted).toBe(true);
});
it('reports storage failure without exposing database details', async () => {
  stubFetch([authRoute, { match: /\/deadset_baselines/, respond: () => jsonResponse({ error: 'private database information' }, 500) }]);
  const response = await handleDeadset(apiRequest('/deadset/baselines'), testEnv);
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain('private database information');
});
it('returns stored snapshots without identity fields and refuses replacement', async () => {
  const baseline = calculateBaseline([], [], [], new Date('2026-09-01T00:00:00Z'));
  stubFetch([authRoute, { match: /\/deadset_baselines/, respond: () => jsonResponse([{ payload: baseline }]) }]);
  const response = await handleDeadset(apiRequest('/deadset/baselines'), testEnv);
  expect(await response.json()).toEqual({ current: baseline, previous: null });
  expect((await handleDeadset(apiRequest('/deadset/baselines', { method: 'POST', body: JSON.stringify(baseline) }), testEnv)).status).toBe(409);
});
