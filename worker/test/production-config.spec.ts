import { describe, expect, it } from 'vitest';
import { validateConfig } from '../src/lib/schemas';

describe('mission-scoped carousel production', () => {
  it('accepts an exact source draft run and rejects malformed run ids', () => {
    const sourceRunId = '55555555-5555-4555-8555-555555555555';
    expect(validateConfig('tiktok.produce', {
      app_slug: 'cast',
      max_per_run: 3,
      source_run_id: sourceRunId,
    })).toMatchObject({ source_run_id: sourceRunId });

    expect(() => validateConfig('tiktok.produce', {
      app_slug: 'cast',
      source_run_id: 'not-a-run-id',
    })).toThrow(/source_run_id/);
  });
});
