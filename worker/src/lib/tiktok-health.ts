import { accessTokenFor, postingInfo } from './tiktok';
import { accountStatsFor, recentVideosFor, type AccountStats, type VideoMetrics } from './tiktok-metrics';
import type { Db } from './db';
import type { Env, TikTokAccount } from '../types';

export async function activeTikTokAccounts(db: Db): Promise<TikTokAccount[]> {
  const apps = await db.select<{ id: string; slug: string }>('apps', 'promotion_enabled=eq.true&slug=in.(deadset,cast)&select=id,slug');
  const accounts = await db.select<TikTokAccount>('tiktok_accounts', 'select=*');
  return accounts.filter(account => apps.some(app => app.id === account.app_id
    && account.handle.replace(/^@/, '').toLowerCase() === (app.slug === 'deadset' ? 'deadset.app' : 'cast.fishing.app')));
}

/** Read-only TikTok checks plus proactive renewal. No publishing or consent. */
export async function checkAccountAccess(env: Env, db: Db, account: TikTokAccount, lookback = 20, recoverExpired = false) {
  const health = {
    checked_at: new Date().toISOString(), posting_ready: false, analytics_ready: false,
    username: null as string | null, token_expires_at: account.token_expires_at,
    errors: [] as string[],
  };
  let stats: AccountStats = { scopeMissing: true };
  let videos: { videos: VideoMetrics[]; scopeMissing: boolean } = { videos: [], scopeMissing: true };
  try {
    // An explicit owner health check may test the existing refresh grant once.
    // Scheduled checks must not repeatedly retry a rejected/revoked grant.
    const recovery = recoverExpired && account.status === 'expired';
    if (account.status !== 'connected' && !recovery) throw new Error(`@${account.handle} requires TikTok reconnection (${account.status})`);
    const token = await accessTokenFor(env, db, account, recovery ? Number.POSITIVE_INFINITY : 6 * 60 * 60_000);
    health.token_expires_at = account.token_expires_at;
    // Identity must be proven before any metrics enter this account's history.
    const info = await postingInfo(env, token, account);
    health.username = info.creator_username;
    health.posting_ready = info.privacy_level_options.includes('PUBLIC_TO_EVERYONE');
    if (!health.posting_ready) health.errors.push('TikTok does not currently allow public posting for this account');
    try { stats = await accountStatsFor(env, token, account); }
    catch (error) { health.errors.push(error instanceof Error ? error.message : String(error)); }
    try { videos = await recentVideosFor(env, token, account, lookback); }
    catch (error) { health.errors.push(error instanceof Error ? error.message : String(error)); }
    health.analytics_ready = !stats.scopeMissing && !videos.scopeMissing;
    if (!health.analytics_ready && !health.errors.length) health.errors.push('TikTok analytics permissions are missing');
  } catch (error) {
    health.errors.push(error instanceof Error ? error.message : String(error));
  }
  await db.update('tiktok_accounts', `id=eq.${account.id}`, { health });
  return { account_id: account.id, handle: account.handle, health, stats, videos };
}
