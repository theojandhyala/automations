import { accessTokenFor, creatorInfo, initVideoPublish } from '../lib/tiktok';
import type { Artifact, TikTokAccount } from '../types';
import type { Handler } from './registry';

/** Preferred privacy level, falling back to whatever the creator offers. */
const PRIVACY_PREFERENCE = ['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'SELF_ONLY'];

function captionFor(artifact: Artifact): string {
  const tags = artifact.hashtags.map((t) => (t.startsWith('#') ? t : `#${t}`)).join(' ');
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
  name: 'Publish approved videos',
  description: 'Sends approved artifacts to TikTok, respecting each account\'s daily limit.',
  async run(ctx) {
    const config = ctx.automation.config as { max_per_run?: number };
    const maxPerRun = Math.min(Math.max(config.max_per_run ?? 3, 1), 10);
    const now = new Date().toISOString();

    const ready = await ctx.db.select<Artifact>(
      'artifacts',
      `status=eq.approved&video_url=not.is.null&account_id=not.is.null` +
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
        await ctx.db.update('artifacts', `id=eq.${artifact.id}`, { status: 'publishing', error: null });

        const token = await accessTokenFor(ctx.env, ctx.db, account);
        const info = await creatorInfo(token);
        const privacy =
          PRIVACY_PREFERENCE.find((p) => info.privacy_level_options.includes(p)) ??
          info.privacy_level_options[0];
        if (!privacy) throw new Error(`@${account.handle} offers no privacy levels`);

        const { publish_id } = await initVideoPublish(token, {
          title: captionFor(artifact),
          videoUrl: artifact.video_url!,
          privacyLevel: privacy,
        });

        // TikTok pulls and encodes asynchronously; tiktok.reconcile closes the
        // loop and moves the artifact to 'published'.
        await ctx.db.update('artifacts', `id=eq.${artifact.id}`, { publish_id });
        postedThisRun.add(accountId);
        published++;
        ctx.log('info', `submitted to @${account.handle}`, { publish_id, privacy });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await ctx.db.update('artifacts', `id=eq.${artifact.id}`, { status: 'failed', error: message });
        ctx.log('error', `failed to publish ${artifact.id}`, { error: message });
      }
    }

    return { submitted: published, skipped };
  },
};
