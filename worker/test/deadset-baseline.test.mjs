import { strict as assert } from 'node:assert';
import test from 'node:test';
import { calculateBaseline, baselineSchema } from '../src/lib/deadset-baseline.ts';
const now = new Date('2026-09-09T12:00:00Z');
const profile = id => ({ id, created_at: '2026-09-01T12:00:00Z' });
const workout = (id, endedAt = '2026-09-09T11:00:00Z') => ({ id, startedAt: '2026-09-09T10:00:00Z', endedAt });
const sub = (overrides = {}) => ({ user_id: 'a', environment: 'live', status: 'active', current_period_end: '2026-10-01T00:00:00Z', cancel_at_period_end: false, ...overrides });

test('deduplicates synced workouts and excludes unfinished, future and malformed records', () => {
  const result = calculateBaseline([profile('a'), profile('b')], [{ user_id: 'a', sessions: [workout('1'), workout('1'), workout('2'), workout('future', '2027-01-01'), workout('bad', 'garbage'), { id: 'unfinished' }] }], [], now);
  assert.equal(result.completed_workouts, 2);
  assert.equal(result.workout_active_7d, 1);
  assert.equal(result.second_workout_users, 1);
  assert.equal(result.invalid_workout_records, 2);
  assert.equal(result.sources[0].users, 2);
});
test('counts live subscribers once, preserves cancelling paid time, excludes sandbox and unknown expiry', () => {
  const result = calculateBaseline([], [], [sub(), sub(), sub({ user_id: 'b', status: 'canceled' }), sub({ user_id: 'c', environment: 'sandbox' }), sub({ user_id: 'd', status: 'trialing' }), sub({ user_id: 'e', current_period_end: null }), sub({ user_id: 'f', current_period_end: '2026-01-01' })], now);
  assert.equal(result.stripe_active_subscribers, 2);
  assert.equal(result.stripe_cancelling_subscribers, 1);
  assert.equal(result.stripe_trial_subscribers, 1);
  assert.equal(result.excluded_sandbox_subscriptions, 1);
  assert.equal(result.stripe_unknown_expiry, 1);
});
test('records orphan coverage and never exports user identities or raw workout data', () => {
  const result = calculateBaseline([profile('private-user')], [{ user_id: 'orphan', sessions: [workout('private-workout')] }], [], now);
  assert.equal(result.orphan_state_records, 1);
  assert.equal(result.synced_users, 0);
  assert.equal(result.completed_workouts, 0);
  assert.equal(JSON.stringify(result).includes('private-'), false);
});
test('rejects impossible imported counts and unrecognised fields', () => {
  const valid = calculateBaseline([], [], [], now);
  assert.equal(baselineSchema.safeParse({ ...valid, first_workout_users: 2 }).success, false);
  assert.equal(baselineSchema.safeParse({ ...valid, secret: 'x' }).success, false);
  assert.equal(baselineSchema.safeParse({ ...valid, window_start: now.toISOString() }).success, false);
});
test('uses exact half-open ageing boundaries without counting future activity', () => {
  const result = calculateBaseline([profile('a')], [{ user_id: 'a', sessions: [{ id: 'w', startedAt: '2026-09-02T11:00:00Z', endedAt: '2026-09-02T12:00:00Z' }] }], [], now);
  assert.equal(result.workouts_7d, 1);
  assert.equal(result.workout_active_24h, 0);
});
