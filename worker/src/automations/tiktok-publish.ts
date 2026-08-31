import { accessTokenFor, creatorInfo, initPhotoPublish, initVideoPublish } from '../lib/tiktok';
import { formatHashtags } from '../lib/hashtags';
import type { Artifact, TikTokAccount } from '../types';
import type { Handler } from './registry';

export function captionFor(artifact: Artifact): string {
  const tags = formatHashtags(artifact.hashtags);
  return [artifact.caption ?? artifact.hook ?? '', tags].filter(Boolean).join('\n\n').slice(0, 2200);
}

/**
 * Publishes approved artifacts, one per account per pass. Only artifacts a
 * human moved to 'approved' in the dashboard are ever eligible -- generation
 * never posts straight through.
 *
 * config: { max_per_run?: number }
 */
export const publishApproved: Handler = {
  key: 'tiktok.publish',
  name: 'Publish approved TikToks',
  description: 'Sends owner-approved videos or photo carousels to TikTok within each account\'s limit.',
  async run(ctx) {
    const config = ctx.automation.config as { max_per_run?: number };
    const maxPerRun = Math.min(Math.max(config.max_per_run ?? 3, 1), 10);
    const now = new Date().toISOString();

    const ready = await ctx.db.select<Artifact>(
      'artifacts',
      `status=eq.approved&account_id=not.is.null` +
        `&or=(scheduled_for.is.null,scheduled_for.lte.${now})` +
        `&order=scheduled_for.asc.nullsfirst&limit=${maxPerRun}`,
    );

    if (ready.length === 0) {
      ctx.log('info', 'nothing approved and due');
      return { published: 0 };
    }

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    let published = 0;
    let skipped = 0;
    const postedThisRun = new Set<string>();

    for (const artifact of ready) {
      const accountId = artifact.account_id!;

      // One post per account per pass keeps a burst of approvals from firing
      // back to back on the same handle.
      if (postedThisRun.has(accountId)) {
        skipped++;
        continue;
      }

      const account = await ctx.db.selectOne<TikTokAccount>(
        'tiktok_accounts',
        `id=eq.${accountId}&select=*`,
      );
      if (!account) {
        ctx.log('warn', `artifact ${artifact.id} points at a missing account`);
        skipped++;
        continue;
      }

      const todaysPosts = await ctx.db.select<{ id: string }>(
        'artifacts',
        `account_id=eq.${accountId}&status=eq.published&published_at=gte.${since}&select=id`,
      );
      if (todaysPosts.length >= account.daily_post_limit) {
        ctx.log('info', `@${account.handle} hit its daily limit (${account.daily_post_limit})`);
        skipped++;
        continue;
      }

      try {
        const mediaReady = artifact.media_type === 'photo'
          ? artifact.photo_urls.length >= 1 && artifact.photo_urls.length <= 35
          : Boolean(artifact.video_url);
        if (!mediaReady) throw new Error(`${artifact.media_type} media is missing`);
        if (!artifact.posting_consent_at) throw new Error('posting consent is missing');
        if (!artifact.tiktok_privacy_level) throw new Error('privacy level was not selected');

        await ctx.setTask(`publishing to @${account.handle}`);
        await ctx.db.update('artifacts', `id=eq.${artifact.id}`, {
          status: 'publishing',
          stage: 'publish',
          error: null,
        });

        const token = await accessTokenFor(ctx.env, ctx.db, account);
        const info = await creatorInfo(token);
        const privacy = artifact.tiktok_privacy_level;
        if (!info.privacy_level_options.includes(privacy)) {
          throw new Error(`selected privacy is no longer available for @${account.handle}; review again`);
        }
        if (
          artifact.media_type === 'video'
          && artifact.duration_s != null
          && artifact.duration_s > info.max_video_post_duration_sec
        ) {
          throw new Error(
            `video is ${artifact.duration_s}s; @${account.handle} currently allows ${info.max_video_post_duration_sec}s`,
          );
        }

        const description = captionFor(artifact);
        const publish = artifact.media_type === 'photo'
          ? await initPhotoPublish(token, {
              title: (artifact.hook ?? artifact.caption ?? 'Deadset').slice(0, 90),
              description,
              photoUrls: artifact.photo_urls,
              privacyLevel: privacy,
              disableComment: artifact.disable_comment || info.comment_disabled,
              autoAddMusic: artifact.auto_add_music,
              brandOrganic: artifact.brand_organic_toggle,
              brandContent: artifact.brand_content_toggle,
            })
          : await initVideoPublish(token, {
              title: description,
              videoUrl: artifact.video_url!,
              privacyLevel: privacy,
              disableComment: artifact.disable_comment || info.comment_disabled,
              brandOrganic: artifact.brand_organic_toggle,
              brandContent: artifact.brand_content_toggle,
              isAigc: artifact.is_aigc,
            });
        const { publish_id } = publish;

        // TikTok pulls and encodes asynchronously; tiktok.reconcile closes the
        // loop and moves the artifact to 'published'.
        await ctx.db.update('artifacts', `id=eq.${artifact.id}`, { publish_id });
        postedThisRun.add(accountId);
        published++;
        ctx.log('info', `submitted ${artifact.media_type} to @${account.handle}`, {
          publish_id,
          privacy,
          media_type: artifact.media_type,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await ctx.db.update('artifacts', `id=eq.${artifact.id}`, { status: 'failed', error: message });
        ctx.log('error', `failed to publish ${artifact.id}`, { error: message });
      }
    }

    return { submitted: published, skipped };
  },
};
