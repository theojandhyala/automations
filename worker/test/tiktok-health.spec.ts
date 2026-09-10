import { beforeEach, describe, expect, it, vi } from 'vitest';
import { checkAccountAccess } from '../src/lib/tiktok-health';
import { accessTokenFor, postingInfo } from '../src/lib/tiktok';
vi.mock('../src/lib/tiktok', () => ({ accessTokenFor: vi.fn(), postingInfo: vi.fn() }));
vi.mock('../src/lib/tiktok-metrics', () => ({
  accountStatsFor: vi.fn(async () => ({ scopeMissing: false })),
  recentVideosFor: vi.fn(async () => ({ scopeMissing: false, videos: [] })),
}));
beforeEach(() => vi.resetAllMocks());
describe('expired access recovery', () => {
  const account = { id: 'cast', handle: 'cast.fishing.app', status: 'expired' } as never;
  const db = { update: vi.fn(async () => []) } as never;
  it('does not retry expired grants on scheduled health checks', async () => {
    await checkAccountAccess({} as never, db, account);
    expect(accessTokenFor).not.toHaveBeenCalled();
  });
  it('explicit checks force refresh before checking identity', async () => {
    vi.mocked(accessTokenFor).mockResolvedValue('test');
    vi.mocked(postingInfo).mockResolvedValue({ creator_username: 'cast.fishing.app', privacy_level_options: ['PUBLIC_TO_EVERYONE'] } as never);
    const result = await checkAccountAccess({} as never, db, account, 20, true);
    expect(accessTokenFor).toHaveBeenCalledWith({}, db, account, Infinity);
    expect(result.health.posting_ready).toBe(true);
  });
  it('preserves exact refresh rejection without claiming posting readiness', async () => {
    vi.mocked(accessTokenFor).mockRejectedValue(new Error('invalid_grant'));
    const result = await checkAccountAccess({} as never, db, account, 20, true);
    expect(result.health.errors).toEqual(['invalid_grant']);
    expect(result.health.posting_ready).toBe(false);
    expect(postingInfo).not.toHaveBeenCalled();
  });
});
