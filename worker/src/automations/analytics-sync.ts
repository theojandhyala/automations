import { activeTikTokAccounts, checkAccountAccess } from '../lib/tiktok-health';
import type { Artifact } from '../types';
import type { Handler } from './registry';

/**
 * Pulls account and per-post metrics for every connected account.
 *
 * This needs the `user.info.stats` and `video.list` scopes, which are separate
 * from the posting scopes. Where they were not granted the snapshot is written
 * with quality 'partial' or 'unavailable' rather than silently recording zeros
 * -- an empty chart and a broken chart should not look the same.
 *
 * config: { lookback_posts?: number }
 */
export const analyticsSync: Handler = {
  key: 'analytics.sync',
  name: 'Analytics sync',
  description: 'Pulls follower, view and per-post metrics for every connected account.',
  async run(ctx) {
    const config = ctx.automation.config as { lookback_posts?: number };
    const lookback = Math.min(Math.max(config.lookback_posts ?? 20, 1), 100);

    const accounts = await activeTikTokAccounts(ctx.db);

    if (accounts.length === 0) {
      ctx.log('warn', 'no connected accounts — analytics is unavailable until one is connected');
      return { accounts: 0, state: 'unavailable' };
    }

    let synced = 0;
    let partial = 0;
    const postRows: Record<string, unknown>[] = [];

    for (const account of accounts) {
      await ctx.setTask(`reading @${account.handle}`);
      try {
        const { health, stats, videos } = await checkAccountAccess(ctx.env, ctx.db, account, lookback);
        if (!health.username) throw new Error(health.errors.join('; '));
        for (const error of health.errors) ctx.log('warn', `@${account.handle}: ${error}`);

        const quality = stats.scopeMissing || videos.scopeMissing ? 'partial' : 'ok';
        if (quality === 'partial') partial++;

        await ctx.db.insert('analytics_snapshots', {
          account_id: account.id,
          app_id: account.app_id,
          followers: stats.follower_count ?? null,
          following: stats.following_count ?? null,
          likes_total: stats.likes_count ?? null,
          video_count: stats.video_count ?? null,
          // The API returns lifetime counts for a bounded list, not 28-day
          // account totals. Do not label these as a complete time series.
          views_28d: null,
          comments_28d: null,
          shares_28d: null,
          quality,
          raw: { stats_scope_missing: stats.scopeMissing, video_scope_missing: videos.scopeMissing, coverage: 'latest_posts_lifetime_metrics', sampled_posts: videos.videos.length },
        });

        // Tie post metrics back to the artifact that produced them, so the
        // review queue can show how a given concept actually performed.
        for (const video of videos.videos) {
          const artifact = await ctx.db.selectOne<Artifact>(
            'artifacts',
            `account_id=eq.${account.id}&tiktok_post_id=eq.${encodeURIComponent(video.id)}&select=id`,
          );
          postRows.push({
            artifact_id: artifact?.id ?? null,
            account_id: account.id,
            tiktok_post_id: video.id,
            views: video.view_count ?? null,
            likes: video.like_count ?? null,
            comments: video.comment_count ?? null,
            shares: video.share_count ?? null,
          });
        }

        synced++;
        ctx.log('info', `@${account.handle}: ${videos.videos.length} posts, quality ${quality}`, {
          followers: stats.follower_count,
        });
      } catch (err) {
        ctx.log('error', `analytics failed for @${account.handle}`, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    await ctx.db.insertMany('post_metrics', postRows);
    if (synced === 0) throw new Error('No active TikTok account passed live identity and analytics checks; inspect Channel uplink health');
    return { accounts: accounts.length, synced, partial, posts: postRows.length };
  },
};
