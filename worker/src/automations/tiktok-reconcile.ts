import { accessTokenFor, publishStatus } from '../lib/tiktok';
import type { Artifact, TikTokAccount } from '../types';
import type { Handler } from './registry';

/** How long a publish may sit in TikTok's queue before we call it stuck. */
const STALE_AFTER_MS = 60 * 60 * 1000;

/**
 * Polls TikTok for artifacts left in 'publishing' and settles them. Without
 * this the dashboard would show videos as forever in-flight, since the publish
 * API only hands back a job id.
 */
export const reconcilePublishing: Handler = {
  key: 'tiktok.reconcile',
  name: 'Reconcile in-flight posts',
  description: 'Checks submitted videos against TikTok and marks them published or failed.',
  async run(ctx) {
    const inFlight = await ctx.db.select<Artifact & { updated_at: string }>(
      'artifacts',
      'status=eq.publishing&publish_id=not.is.null&select=*&order=updated_at.asc&limit=25',
    );

    if (inFlight.length === 0) return { checked: 0 };

    let settled = 0;
    let failed = 0;

    for (const artifact of inFlight) {
      const account = artifact.account_id
        ? await ctx.db.selectOne<TikTokAccount>('tiktok_accounts', `id=eq.${artifact.account_id}&select=*`)
        : null;
      if (!account) {
        ctx.log('warn', `artifact ${artifact.id} has no account to check against`);
        continue;
      }

      try {
        const token = await accessTokenFor(ctx.env, ctx.db, account);
        const status = await publishStatus(token, artifact.publish_id!);

        if (status.status === 'PUBLISH_COMPLETE') {
          await ctx.db.update('artifacts', `id=eq.${artifact.id}`, {
            status: 'published',
            published_at: new Date().toISOString(),
            tiktok_post_id: status.publicaly_available_post_id?.[0] ?? null,
          });
          settled++;
          ctx.log('info', `published to @${account.handle}`);
        } else if (status.status === 'FAILED') {
          await ctx.db.update('artifacts', `id=eq.${artifact.id}`, {
            status: 'failed',
            error: status.fail_reason ?? 'TikTok reported FAILED',
          });
          failed++;
          ctx.log('error', `TikTok rejected ${artifact.id}`, { reason: status.fail_reason });
        } else if (Date.now() - Date.parse(artifact.updated_at) > STALE_AFTER_MS) {
          await ctx.db.update('artifacts', `id=eq.${artifact.id}`, {
            status: 'failed',
            error: `stuck in ${status.status} for over an hour`,
          });
          failed++;
          ctx.log('warn', `giving up on ${artifact.id}`, { last_status: status.status });
        } else {
          ctx.log('debug', `${artifact.id} still ${status.status}`);
        }
      } catch (err) {
        ctx.log('error', `status check failed for ${artifact.id}`, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return { checked: inFlight.length, published: settled, failed };
  },
};
