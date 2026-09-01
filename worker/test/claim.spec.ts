import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index';
import { claimDue, claimOne, dispatchDue } from '../src/lib/runner';
import {
  OWNER_TOKEN,
  apiRequest,
  authRoute,
  automationRow,
  jsonResponse,
  stubFetch,
  testEnv,
} from './helpers';

afterEach(() => vi.unstubAllGlobals());

/** Routes covering the writes an empty reconciliation run performs after being claimed. */
const runWriteRoutes = [
  {
    match: /\/rest\/v1\/runs\?/,
    respond: () => jsonResponse([]),
  },
  {
    match: /\/rest\/v1\/runs$/,
    respond: () => jsonResponse([{ id: '99999999-9999-4999-8999-999999999999' }]),
  },
  { match: /\/rest\/v1\/run_events/, respond: () => jsonResponse([]) },
  { match: /\/rest\/v1\/artifacts/, respond: () => jsonResponse([]) },
  { match: /\/rest\/v1\/automations\?/, respond: () => jsonResponse([]) },
];

const postingAutomation = () => automationRow({ handler_key: 'tiktok.reconcile', name: 'Reconcile in-flight posts' });

describe('atomic claim', () => {
  it('claims through the RPC, not a select-then-update', async () => {
    const { calls } = stubFetch([
      { match: /\/rpc\/claim_due_automations/, respond: () => jsonResponse([postingAutomation()]) },
    ]);

    const claimed = await claimDue(testEnv);

    expect(claimed).toHaveLength(1);
    // The whole point of the fix: one call, and it is the RPC. A plain
    // `GET /automations?next_run_at=lte...` here would be the old race.
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toContain('/rpc/claim_due_automations');
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.body).toEqual({ p_limit: 20 });
  });

  it('runs nothing when the claim comes back empty', async () => {
    const { calls } = stubFetch([
      { match: /\/rpc\/claim_due_automations/, respond: () => jsonResponse([]) },
    ]);

    const result = await dispatchDue(testEnv);

    expect(result).toEqual({ started: 0 });
    // No run row was opened -- an unclaimed automation must not execute.
    expect(calls.filter((c) => c.url.includes('/rest/v1/runs'))).toHaveLength(0);
  });

  it('a second dispatcher gets nothing while the first holds the claim', async () => {
    // Models SKIP LOCKED: the first caller takes the row, the second sees none.
    let served = 0;
    stubFetch([
      {
        match: /\/rpc\/claim_due_automations/,
        respond: () => jsonResponse(served++ === 0 ? [postingAutomation()] : []),
      },
      ...runWriteRoutes,
    ]);

    const [first, second] = await Promise.all([dispatchDue(testEnv), dispatchDue(testEnv)]);

    expect(first.started + second.started).toBe(1);
  });

  it('claimOne returns null when the automation is already running', async () => {
    stubFetch([{ match: /\/rpc\/claim_automation/, respond: () => jsonResponse([]) }]);

    expect(await claimOne(testEnv, '11111111-1111-4111-8111-111111111111')).toBeNull();
  });

  it('a manual trigger on a running automation is refused with 409', async () => {
    stubFetch([
      authRoute,
      {
        match: /\/rest\/v1\/automations\?id=eq/,
        respond: () => jsonResponse([{ ...postingAutomation(), status: 'running' }]),
      },
      // The claim fails because the row is held.
      { match: /\/rpc\/claim_automation/, respond: () => jsonResponse([]) },
    ]);

    const ctx = createExecutionContext();
    const res = await worker.fetch(
      apiRequest('/automations/11111111-1111-4111-8111-111111111111/run', { method: 'POST' }),
      testEnv,
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'already running' });
  });

  it('a manual trigger that wins the claim starts exactly one run', async () => {
    let claims = 0;
    let runsOpened = 0;

    stubFetch([
      authRoute,
      {
        match: /\/rest\/v1\/automations\?id=eq/,
        respond: () => jsonResponse([postingAutomation()]),
      },
      {
        match: /\/rpc\/claim_automation/,
        respond: () => jsonResponse(claims++ === 0 ? [postingAutomation()] : []),
      },
      {
        match: /\/rest\/v1\/runs$/,
        respond: () => {
          runsOpened++;
          return jsonResponse([{ id: '99999999-9999-4999-8999-999999999999' }]);
        },
      },
      { match: /\/rest\/v1\/runs\?/, respond: () => jsonResponse([]) },
      { match: /\/rest\/v1\/run_events/, respond: () => jsonResponse([]) },
      { match: /\/rest\/v1\/artifacts/, respond: () => jsonResponse([]) },
      { match: /\/rest\/v1\/automations\?/, respond: () => jsonResponse([]) },
    ]);

    const ctx = createExecutionContext();
    const path = '/automations/11111111-1111-4111-8111-111111111111/run';
    const [first, second] = await Promise.all([
      worker.fetch(apiRequest(path, { method: 'POST', token: OWNER_TOKEN }), testEnv, ctx),
      worker.fetch(apiRequest(path, { method: 'POST', token: OWNER_TOKEN }), testEnv, ctx),
    ]);
    await waitOnExecutionContext(ctx);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([202, 409]);
    // Idempotency: two overlapping triggers, one run row.
    expect(runsOpened).toBe(1);
  });
});
