import { strict as assert } from 'node:assert';
import test from 'node:test';
import { isValidCron, nextRun } from '../src/lib/cron.ts';

const at = (iso) => new Date(iso);

test('every minute', () => {
  assert.equal(nextRun('* * * * *', at('2026-01-01T00:00:30Z')).toISOString(), '2026-01-01T00:01:00.000Z');
});

test('fixed hour and minute', () => {
  assert.equal(nextRun('30 9 * * *', at('2026-01-01T09:31:00Z')).toISOString(), '2026-01-02T09:30:00.000Z');
});

test('step values', () => {
  assert.equal(nextRun('0 */6 * * *', at('2026-01-01T07:00:00Z')).toISOString(), '2026-01-01T12:00:00.000Z');
});

test('lists and ranges', () => {
  assert.equal(nextRun('0 9,17 * * 1-5', at('2026-01-03T00:00:00Z')).toISOString(), '2026-01-05T09:00:00.000Z');
});

test('day-of-month and day-of-week OR together', () => {
  // 2026-06-01 is a Monday; the 15th is the next matching day-of-month.
  const next = nextRun('0 0 15 * 1', at('2026-06-01T01:00:00Z'));
  assert.equal(next.toISOString(), '2026-06-08T00:00:00.000Z'); // next Monday comes first
});

test('never-matching expression returns null rather than looping', () => {
  assert.equal(nextRun('0 0 30 2 *', at('2026-01-01T00:00:00Z')), null);
});

test('strictly after the given time', () => {
  assert.equal(nextRun('0 * * * *', at('2026-01-01T05:00:00Z')).toISOString(), '2026-01-01T06:00:00.000Z');
});

test('validation', () => {
  assert.equal(isValidCron('0 0 * * *'), true);
  assert.equal(isValidCron('0 0 * *'), false);
  assert.equal(isValidCron('99 0 * * *'), false);
  assert.equal(isValidCron('nonsense'), false);
});
