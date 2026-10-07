import { MANAGED_BRANDS, isManagedBrand, isTruthfulPrelaunchPreview, publicRelease } from '../lib/managed-brands';
import { assessCreativeQuality } from '../lib/creative-quality';
import { isRepeatedHook } from '../lib/creative-variety';
import { hasPassingVisualReview } from '../lib/creative-visual-review';
import { automaticCreativeApprovalAllowed } from '../lib/owner-approval';
import { deliveryPaused, timedDeliveryStage } from '../lib/timed-delivery';
import { accessTokenFor, unattendedPublishingEnabled } from '../lib/tiktok';
import type { Artifact, TikTokAccount } from '../types';
import type { Handler } from './registry';

type Slot = { at: string; localDay: string; localTime: string };
type Mission = { id: string; slug: string; promotion_enabled: boolean };

function localParts(at: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(at);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value ?? '';
  return {
    day: `${value('year')}-${value('month')}-${value('day')}`,
    time: `${value('hour')}:${value('minute')}`,
  };
}

/** Build exact future London slots without assuming a fixed UTC offset. */
export function futurePostingSlots(
  now: Date,
  horizonHours: number,
  timezone: string,
  localTimes: string[],
): Slot[] {
  const wanted = new Set(localTimes);
  const start = Math.floor(now.getTime() / 60_000) * 60_000 + 60_000;
  const end = now.getTime() + horizonHours * 3600_000;
  const slots: Slot[] = [];
  for (let time = start; time <= end; time += 60_000) {
    const at = new Date(time);
    const local = localParts(at, timezone);
    if (wanted.has(local.time)) slots.push({ at: at.toISOString(), localDay: local.day, localTime: local.time });
  }
  return slots;
}

function roleRank(artifact: Artifact, localTime: string): number {
  const slides = artifact.photo_urls.length;
  if (localTime === '10:00') return slides <= 4 ? 0 : 10 + slides;
  if (localTime === '13:00') return slides >= 6 ? 0 : 10 - slides;
  return slides >= 3 && slides <= 6 ? 0 : Math.abs(slides - 4) + 5;
}

/**
 * Cloud-only readiness controller. It never creates or edits creative media.
 * It promotes only an unchanged exact carousel that already passed the signed
 * visual review, then gives it a signed future booking for an approved slot.
 */
export const ensureTikTokReadiness: Handler = {
  key: 'tiktok.readiness',
  name: 'TikTok cloud readiness',
  description: 'Approves exact reviewed owned-brand posts and books the next London delivery slots in Cloudflare.',
  async run(ctx) {
    const config = ctx.automation.config as {
      horizon_hours?: number;
      timezone?: string;
      local_times?: string[];
      target_days?: number;
    };
    const horizonHours = Math.min(Math.max(config.horizon_hours ?? 42, 6), 96);
    const timezone = config.timezone ?? 'Europe/London';
    const localTimes = config.local_times ?? ['10:00', '13:00', '17:00'];
    // One day's reserve has repeatedly left a slot uncovered after a source,
    // visual, or provider failure. Maintain two days of *reviewed* coverage;
    // absent media is reported as a shortage rather than silently published.
    const targetDays = Math.min(Math.max(config.target_days ?? 2, 2), 3);
    if (!unattendedPublishingEnabled(ctx.env)) {
      return { ready: false, reason: 'Unattended TikTok Business publishing is not enabled.' };
    }

    const allSlots = futurePostingSlots(new Date(), horizonHours, timezone, localTimes);
    const days = [...new Set(allSlots.map(slot => slot.localDay))].slice(0, targetDays);
    const targetSlots = allSlots.filter(slot => days.includes(slot.localDay));
    const missions = await ctx.db.select<Mission>('apps',
      'slug=in.(deadset,cast,lifescore,reclaim)&select=id,slug,promotion_enabled&order=slug.asc');
    const accounts = await ctx.db.select<TikTokAccount>('tiktok_accounts',
      'status=eq.connected&select=*');

    let approved = 0;
    let booked = 0;
    const missing: Array<{ app: string; day: string; slot: string; reason: string }> = [];
    const bookings: Array<{ app: string; artifact_id: string; at: string }> = [];

    for (const mission of missions) {
      const account = accounts.find(candidate => candidate.app_id === mission.id
        && candidate.handle.trim().replace(/^@/, '').toLowerCase() === (isManagedBrand(mission.slug) ? MANAGED_BRANDS[mission.slug].handle : ''));
      if (!account) {
        for (const slot of targetSlots) missing.push({ app: mission.slug, day: slot.localDay, slot: slot.localTime, reason: 'Connected owned account is missing.' });
        continue;
      }
      try {
        // Keep both owned-account grants warm in Cloudflare even while a
        // quality hold pauses publishing, so clearing the hold never depends
        // on the owner's laptop or another interactive login.
        await accessTokenFor(ctx.env, ctx.db, account);
      } catch {
        for (const slot of targetSlots) missing.push({ app: mission.slug, day: slot.localDay, slot: slot.localTime, reason: 'Owned-account token refresh failed.' });
        continue;
      }
      const release = await publicRelease(ctx.env, mission.slug);
      if (!mission.promotion_enabled) {
        for (const slot of targetSlots) missing.push({
          app: mission.slug,
          day: slot.localDay,
          slot: slot.localTime,
          reason: 'Promotion is paused; no creative may be released until its exact quality hold is cleared.',
        });
        continue;
      }

      const existing = await ctx.db.select<Artifact>('artifacts',
        `account_id=eq.${account.id}&status=in.(approved,publishing,published)`
        + `&scheduled_for=gte.${targetSlots[0]?.at ?? new Date().toISOString()}`
        + `&scheduled_for=lte.${targetSlots.at(-1)?.at ?? new Date().toISOString()}`
        + '&select=*&order=scheduled_for.asc&limit=30');
      const used = new Set(existing.map(artifact => artifact.scheduled_for).filter(Boolean));
      const recent = await ctx.db.select<{ hook: string | null }>('artifacts',
        `account_id=eq.${account.id}&status=in.(published,publishing)&select=hook&order=created_at.desc&limit=90`);
      const candidates = await ctx.db.select<Artifact>('artifacts',
        `account_id=eq.${account.id}&status=in.(draft,approved)&publish_id=is.null&tiktok_post_id=is.null`
        + '&scheduled_for=is.null&media_type=eq.photo&select=*&order=created_at.desc&limit=100');

      const eligible: Artifact[] = [];
      for (let artifact of candidates) {
        if (deliveryPaused(artifact) || !automaticCreativeApprovalAllowed(mission.slug)) continue;
        if (artifact.asset_manifest.app_slug !== mission.slug) continue;
        if (!release.available && !isTruthfulPrelaunchPreview(artifact, mission.slug)) continue;
        if (!await hasPassingVisualReview(ctx.env, artifact)) continue;
        // Production starts with an explicit owner hold. Evaluate the exact
        // reviewed candidate as it would exist after that one operational flag
        // is cleared; every native-photo, source, pixel and truth gate remains.
        const releaseManifest = { ...artifact.asset_manifest, requires_owner_review: false };
        const quality = assessCreativeQuality({
          hook: artifact.hook, caption: artifact.caption, hashtags: artifact.hashtags,
          mediaType: artifact.media_type, assetManifest: releaseManifest,
          photoUrls: artifact.photo_urls, videoUrl: artifact.video_url,
        });
        if (!quality.pass) continue;
        if (isRepeatedHook(artifact.hook ?? '', recent.map(post => post.hook ?? ''))) continue;
        if (artifact.status === 'draft') {
          const approvedAt = new Date().toISOString();
          const [updated] = await ctx.db.update<Artifact>('artifacts',
            `id=eq.${artifact.id}&status=eq.draft&scheduled_for=is.null`, {
              status: 'approved', stage: 'schedule', error: null,
              asset_manifest: { ...releaseManifest, creative_quality: quality },
              tiktok_privacy_level: 'PUBLIC_TO_EVERYONE', disable_comment: false,
              auto_add_music: true, brand_organic_toggle: true, brand_content_toggle: false,
              posting_consent_at: null,
              stages: {
                ...artifact.stages,
                review: { state: 'done', at: approvedAt, note: 'Cloud exact-media, source, quality and truth gates passed.' },
                schedule: { state: 'pending', at: approvedAt, note: 'Awaiting a signed London delivery slot.' },
              },
            });
          if (!updated) continue;
          artifact = updated;
          approved++;
        }
        if (artifact.asset_manifest.requires_owner_review === true) continue;
        eligible.push(artifact);
      }

      for (const slot of targetSlots) {
        if (used.has(slot.at)) continue;
        eligible.sort((a, b) => roleRank(a, slot.localTime) - roleRank(b, slot.localTime));
        const artifact = eligible.shift();
        if (!artifact) {
          missing.push({ app: mission.slug, day: slot.localDay, slot: slot.localTime, reason: 'No independently reviewed unused creative passed every release gate.' });
          continue;
        }
        const delivery = await timedDeliveryStage(ctx.env, artifact, slot.at);
        const [updated] = await ctx.db.update<Artifact>('artifacts',
          `id=eq.${artifact.id}&status=eq.approved&scheduled_for=is.null&publish_id=is.null`, {
            scheduled_for: slot.at, stage: 'schedule', error: null,
            stages: {
              ...artifact.stages,
              schedule: { state: 'done', at: new Date().toISOString(), note: `Booked for ${slot.localTime} ${timezone}.` },
              delivery,
            },
          });
        if (!updated) {
          missing.push({ app: mission.slug, day: slot.localDay, slot: slot.localTime, reason: 'Creative changed while the cloud booking was being signed.' });
          continue;
        }
        used.add(slot.at);
        booked++;
        bookings.push({ app: mission.slug, artifact_id: artifact.id, at: slot.at });
      }
    }

    for (const item of missing) ctx.log('warn', 'daily TikTok slot is not ready', item);
    return { ready: missing.length === 0, approved, booked, bookings, missing };
  },
};
