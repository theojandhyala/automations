import { automaticCreativeApprovalAllowed, hasExactOwnerApproval } from '../lib/owner-approval';
import {
  accessTokenFor,
  initOwnedPhotoPublish,
  initPhotoPublish,
  initVideoPublish,
  isDirectPostPrivacyAllowed,
  postingInfo,
  publishProvider,
  unattendedPublishingEnabled,
  TikTokMediaOwnershipRejected,
} from '../lib/tiktok';
import { formatHashtags } from '../lib/hashtags';
import { assessCreativeQuality } from '../lib/creative-quality';
import { verifyPublishMedia } from '../lib/publish-media';
import { isRepeatedHook } from '../lib/creative-variety';
import type { Artifact, TikTokAccount } from '../types';
import type { Handler } from './registry';

interface PublishMissionApp {
  id: string;
  slug: string;
  promotion_enabled: boolean;
}

const ACTIVE_PUBLISH_MISSIONS = new Set(['deadset', 'cast']);

export function isPostingSlot(at: Date, timezone: string, localHours: number[]): boolean {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value);
  // Cloudflare cron triggers can start a little after the nominal second. A
  // five-minute grace window avoids losing a day's post to harmless scheduler
  // latency; the database reserves each account/slot once, so retries inside
  // this window cannot create duplicate submissions.
  return minute >= 0 && minute < 5 && localHours.includes(hour);
}

export function startOfLocalDay(at: Date, timezone: string): Date {
  const dateParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(dateParts.find((candidate) => candidate.type === type)?.value);
  const guess = Date.UTC(part('year'), part('month') - 1, part('day'));
  const localAtGuess = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(guess));
  const localPart = (type: Intl.DateTimeFormatPartTypes) =>
    Number(localAtGuess.find((candidate) => candidate.type === type)?.value);
  const localAsUtc = Date.UTC(
    localPart('year'),
    localPart('month') - 1,
    localPart('day'),
    localPart('hour'),
    localPart('minute'),
    localPart('second'),
  );
  return new Date(guess - (localAsUtc - guess));
}

export function captionFor(artifact: Artifact): string {
  const tags = formatHashtags(artifact.hashtags);
  return [artifact.caption ?? artifact.hook ?? '', tags].filter(Boolean).join('\n\n').slice(0, 2200);
}

/**
 * Final fail-closed routing gate. Generation and rendering are already scoped
 * by app; this repeats the check at the irreversible publish boundary so a
 * stale or manually edited row can never cross from Deadset to Cast (or wake
 * the unreleased LifeScore mission).
 */
export function missionRoutingError(
  artifact: Pick<Artifact, 'app_id' | 'asset_manifest'>,
  account: Pick<TikTokAccount, 'app_id'>,
  app: PublishMissionApp | null,
): string | null {
  if (!artifact.app_id) return 'artifact is not assigned to an app mission';
  if (!account.app_id) return 'TikTok account is not assigned to an app mission';
  if (artifact.app_id !== account.app_id) return 'artifact and TikTok account belong to different app missions';
  if (!app || app.id !== artifact.app_id) return 'artifact app mission does not exist';
  if (!ACTIVE_PUBLISH_MISSIONS.has(app.slug) || !app.promotion_enabled) {
    return `${app.slug} publishing is locked`;
  }
  const manifestSlug = typeof artifact.asset_manifest.app_slug === 'string'
    ? artifact.asset_manifest.app_slug
    : null;
  if (manifestSlug !== app.slug) return `creative manifest is not verified for ${app.slug}`;
  return null;
}

/**
 * Publishes approved artifacts, one per account per pass. Content Posting API
 * artifacts require explicit owner consent. Approved TikTok Accounts API apps
 * may instead receive quality-gated artifacts from the autonomous producer.
 *
 * config: { max_per_run?: number }
 */
export const publishApproved: Handler = {
  key: 'tiktok.publish',
  name: 'Publish approved TikToks',
  description: 'Sends owner-approved videos or photo carousels to TikTok within each account\'s limit.',
  async run(ctx) {
    const config = ctx.automation.config as {
      max_per_run?: number;
      timezone?: string;
      local_hours?: number[];
    };
    const maxPerRun = Math.min(Math.max(config.max_per_run ?? 3, 1), 10);
    const unattended = unattendedPublishingEnabled(ctx.env);
    const nowDate = new Date();
    const now = nowDate.toISOString();

    // Never let the minute cron turn a consumer Sandbox connection into an
    // accidental private-post machine. Scheduled delivery is enabled only
    // after TikTok has approved the owned Business Accounts API provider.
    // Owner-triggered manual runs remain available for explicitly consented
    // Content Posting artifacts.
    if (ctx.trigger === 'cron' && !unattended) {
      ctx.log('warn', 'scheduled publishing is locked until TikTok Accounts API is approved', {
        provider: publishProvider(ctx.env),
        review_state: ctx.env.TIKTOK_REVIEW_STATE,
      });
      return { submitted: 0, skipped: 0, public_automation_locked: true };
    }

    // The cron checks every minute. Scheduled runs only
    // continue when the wall-clock time in London is exactly 12, 15 or 18;
    // explicit manual runs remain available to the owner at any time.
    if (
      ctx.trigger === 'cron'
      && config.timezone
      && config.local_hours?.length
      && !isPostingSlot(nowDate, config.timezone, config.local_hours)
    ) {
      ctx.log('info', 'outside configured local posting window', {
        timezone: config.timezone,
        local_hours: config.local_hours,
      });
      return { submitted: 0, skipped: 0, outside_posting_window: true };
    }

    // Look beyond one small page so a backlog for one account cannot hide the
    // next due post for another account. The loop still submits at most one
    // item per account and maxPerRun items overall.
    const ready = await ctx.db.select<Artifact>(
      'artifacts',
      `status=eq.approved&account_id=not.is.null` +
        `&or=(scheduled_for.is.null,scheduled_for.lte.${now})` +
        `&order=scheduled_for.asc.nullsfirst&limit=${Math.max(maxPerRun * 20, 100)}`,
    );

    if (ready.length === 0) {
      ctx.log('info', 'nothing approved and due');
      return { published: 0 };
    }

    let published = 0;
    let skipped = 0;
    const postedThisRun = new Set<string>();

    for (const artifact of ready) {
      if (published >= maxPerRun) break;
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

      const app = artifact.app_id
        ? await ctx.db.selectOne<PublishMissionApp>(
            'apps',
            `id=eq.${artifact.app_id}&select=id,slug,promotion_enabled`,
          )
        : null;
      const routingError = missionRoutingError(artifact, account, app);
      if (routingError) {
        await ctx.db.update('artifacts', `id=eq.${artifact.id}`, {
          status: 'failed',
          error: `Publish interlock: ${routingError}.`,
        });
        ctx.log('error', `blocked cross-mission publish for ${artifact.id}`, {
          account_id: account.id,
          artifact_app_id: artifact.app_id,
          account_app_id: account.app_id,
          reason: routingError,
        });
        skipped++;
        continue;
      }

      if (artifact.asset_manifest.requires_owner_review === true && !await hasExactOwnerApproval(artifact)) {
        ctx.log('warn', 'Exact owner review required for the new editorial format', { artifact_id: artifact.id });
        continue;
      }
      if (app?.slug === 'deadset' && !(unattended && automaticCreativeApprovalAllowed(app.slug)) && !await hasExactOwnerApproval(artifact)) {
        ctx.log('warn', 'Deadset owner approval required for this exact creative', { artifact_id: artifact.id });
        skipped++;
        continue;
      }
      postedThisRun.add(accountId);
      let attempted = false;
      let submissionId: string | undefined;
      try {
        const recentPosts = await ctx.db.select<{ hook: string | null }>('artifacts',
          `account_id=eq.${accountId}&status=in.(published,publishing)&select=hook&order=created_at.desc&limit=90`);
        if (isRepeatedHook(artifact.hook ?? '', recentPosts.map(post => post.hook ?? ''))) {
          await ctx.db.update('artifacts', `id=eq.${artifact.id}&status=eq.approved`, {
            status: 'draft', stage: 'review', error: 'Creative variety hold: this hook repeats recent account content; replace the concept.',
          });
          // A rejected concept made no delivery attempt; let a different,
          // eligible concept for this account use the same scheduled slot.
          postedThisRun.delete(accountId);
          skipped++; continue;
        }
        const quality = assessCreativeQuality({
          hook: artifact.hook, caption: artifact.caption, hashtags: artifact.hashtags,
          mediaType: artifact.media_type, assetManifest: artifact.asset_manifest,
          photoUrls: artifact.photo_urls, videoUrl: artifact.video_url,
        });
        if (!quality.pass) {
          await ctx.db.update('artifacts', `id=eq.${artifact.id}&status=eq.approved`, {
            status: 'draft', stage: 'review', error: `Creative quality hold: ${[...quality.blockers, ...quality.warnings].join(' ')}`,
          });
          postedThisRun.delete(accountId);
          skipped++;
          continue;
        }
        const mediaReady = artifact.media_type === 'photo'
          ? artifact.photo_urls.length >= 1 && artifact.photo_urls.length <= 35
          : Boolean(artifact.video_url);
        if (!mediaReady) throw new Error(`${artifact.media_type} media is missing`);
        if (!unattended && !artifact.posting_consent_at) throw new Error('posting consent is missing');
        const privacy = artifact.tiktok_privacy_level
          ?? (unattended ? 'PUBLIC_TO_EVERYONE' : null);
        if (!privacy) throw new Error('privacy level was not selected');
        if (!isDirectPostPrivacyAllowed(ctx.env.TIKTOK_REVIEW_STATE, privacy)) {
          throw new Error('TikTok Sandbox posts must use SELF ONLY privacy');
        }

        await ctx.setTask(`publishing to @${account.handle}`);
        await verifyPublishMedia(ctx.env, artifact);
        const token = await accessTokenFor(ctx.env, ctx.db, account);
        const info = await postingInfo(ctx.env, token, account);
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
        const provider = publishProvider(ctx.env);
        if (provider === 'business_accounts' && artifact.media_type !== 'photo') {
          throw new Error('TikTok Accounts API video publishing is not enabled; use the carousel pipeline');
        }
        if (provider === 'business_accounts' && !account.open_id) {
          throw new Error(`@${account.handle} needs reconnecting to TikTok Accounts API`);
        }
        // Database transaction serializes this account, enforces exact handle,
        // London slot and daily cap, and holds uncertain attempts indefinitely.
        const reserved = await ctx.db.rpc<boolean>('reserve_tiktok_delivery', {
          p_artifact_id: artifact.id, p_scheduled: ctx.trigger === 'cron',
          p_expected: {
            app_id: artifact.app_id, account_id: artifact.account_id, hook: artifact.hook,
            caption: artifact.caption, hashtags: artifact.hashtags, photo_urls: artifact.photo_urls,
            video_url: artifact.video_url, media_type: artifact.media_type, asset_manifest: artifact.asset_manifest,
            tiktok_privacy_level: artifact.tiktok_privacy_level, posting_consent_at: artifact.posting_consent_at,
            disable_comment: artifact.disable_comment, auto_add_music: artifact.auto_add_music,
            brand_organic_toggle: artifact.brand_organic_toggle, brand_content_toggle: artifact.brand_content_toggle,
            is_aigc: artifact.is_aigc, stages: artifact.stages,
          },
        });
        if (!reserved) { skipped++; continue; }
        attempted = true;
        const publish = artifact.media_type === 'photo'
          ? provider === 'business_accounts'
            ? await initOwnedPhotoPublish(token, account.open_id!, {
                title: (artifact.hook ?? artifact.caption ?? 'JARVIS').slice(0, 90),
                caption: description,
                photoUrls: artifact.photo_urls,
                privacyLevel: privacy,
                disableComment: artifact.disable_comment || info.comment_disabled,
                autoAddMusic: artifact.auto_add_music,
                brandOrganic: artifact.brand_organic_toggle,
                brandContent: artifact.brand_content_toggle,
              })
            : await initPhotoPublish(token, {
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
        if (!publish_id) throw new Error('TikTok returned no submission ID');
        submissionId = publish_id;

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
        await ctx.db.update('artifacts', `id=eq.${artifact.id}`, attempted && !submissionId && err instanceof TikTokMediaOwnershipRejected ? {
          status: 'failed',
          error: message,
        } : attempted ? {
          status: 'publishing',
          ...(submissionId ? { publish_id: submissionId } : {}),
          error: `Delivery outcome uncertain; do not resubmit. ${message}`,
        } : {
          // Preflight sent nothing to TikTok; a bounded later check is safe.
          error: `Publish preflight: ${message}`,
          scheduled_for: new Date(Date.now() + 120_000).toISOString(),
        });
        ctx.log('error', `publish ${attempted ? 'requires reconciliation' : 'preflight failed'} for ${artifact.id}`, { error: message });
      }
    }

    return { submitted: published, skipped };
  },
};
