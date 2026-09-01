import { accessTokenFor } from '../lib/tiktok';
import { accountStatsFor, recentVideosFor } from '../lib/tiktok-metrics';
import type { Artifact, TikTokAccount } from '../types';
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

    const accounts = await ctx.db.select<TikTokAccount>(
      'tiktok_accounts',
      'status=eq.connected&select=*',
    );

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
        const token = await accessTokenFor(ctx.env, ctx.db, account);

        const stats = await accountStatsFor(ctx.env, token, account);
        const videos = stats.scopeMissing
          ? { videos: [], scopeMissing: true }
          : await recentVideosFor(ctx.env, token, account, lookback);

        const quality = stats.scopeMissing || videos.scopeMissing ? 'partial' : 'ok';
        if (quality === 'partial') partial++;

        await ctx.db.insert('analytics_snapshots', {
          account_id: account.id,
          app_id: account.app_id,
          followers: stats.follower_count ?? null,
          following: stats.following_count ?? null,
          likes_total: stats.likes_count ?? null,
          video_count: stats.video_count ?? null,
          views_28d: videos.videos.reduce((sum, v) => sum + (v.view_count ?? 0), 0) || null,
          comments_28d: videos.videos.reduce((sum, v) => sum + (v.comment_count ?? 0), 0) || null,
          shares_28d: videos.videos.reduce((sum, v) => sum + (v.share_count ?? 0), 0) || null,
          quality,
          raw: { stats_scope_missing: stats.scopeMissing, video_scope_missing: videos.scopeMissing },
        });

        // Tie post metrics back to the artifact that produced them, so the
        // review queue can show how a given concept actually performed.
        for (const video of videos.videos) {
          const artifact = await ctx.db.selectOne<Artifact>(
            'artifacts',
            `tiktok_post_id=eq.${video.id}&select=id`,
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
    return { accounts: accounts.length, synced, partial, posts: postRows.length };
  },
};
