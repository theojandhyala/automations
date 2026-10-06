import { afterEach, describe, expect, it, vi } from 'vitest';
import { accessTokenFor, postingInfo } from '../src/lib/tiktok';
import { encrypt } from '../src/lib/crypto';
import { Db } from '../src/lib/db';
import { publishApproved } from '../src/automations/tiktok-publish';
import { produceCarousels } from '../src/automations/tiktok-produce';
import { CAPTION_RENDERER_VERSION } from '../src/lib/slide-renderer';
import { isRepeatedHook } from '../src/lib/creative-variety';
import { planCreativeFeatures } from '../src/lib/creative-intelligence';
import { getCreativePlaybook } from '../src/lib/creative-playbooks';
import { verifyPublishMedia } from '../src/lib/publish-media';
import { ownerApprovalReceipt, hasExactOwnerApproval, automaticCreativeApprovalAllowed } from '../src/lib/owner-approval';
import type { Artifact, Automation, Env, TikTokAccount } from '../src/types';
import { automationRow, jsonResponse, stubFetch, testEnv } from './helpers';
import * as independentReview from '../src/lib/creative-visual-review';
import { visualReviewFixture } from './visual-review-fixture';
import { timedDeliveryStage } from '../src/lib/timed-delivery';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });
const env: Env = { ...testEnv, PUBLIC_BASE_URL: 'https://example.test',
  TIKTOK_PUBLISH_PROVIDER: 'business_accounts', TIKTOK_REVIEW_STATE: 'approved',
  TIKTOK_BUSINESS_CLIENT_ID: 'test-client', TIKTOK_BUSINESS_CLIENT_SECRET: 'test-secret',
  TIKTOK_BUSINESS_AUTH_URL: 'https://example.test/authorize', TIKTOK_BUSINESS_REDIRECT_URI: 'https://example.test/api/tiktok/callback/' };

async function account(expired = false): Promise<TikTokAccount> {
  return { id: 'account-1', app_id: 'deadset-id', handle: 'deadset.app', display_name: null, open_id: 'open-1',
    access_token_enc: await encrypt('test-access', env.TOKEN_ENCRYPTION_KEY),
    refresh_token_enc: await encrypt('test-refresh', env.TOKEN_ENCRYPTION_KEY),
    token_expires_at: new Date(Date.now() + (expired ? -1 : 86400_000)).toISOString(), status: 'connected', daily_post_limit: 3 };
}

describe('unattended safety', () => {
  it('rejects wrong live account identity before asking for publishing settings', async () => {
    const { calls } = stubFetch([{ match: /business\/get\//, respond: () => jsonResponse({ code: 0, data: { username: 'cast.fishing.app' } }) }]);
    await expect(postingInfo(env, 'test-access', await account())).rejects.toThrow('identity does not match');
    expect(calls).toHaveLength(1);
  });

  it('does not rotate a token already claimed by another job', async () => {
    const { calls } = stubFetch([{ match: /rpc\/claim_tiktok_refresh/, respond: () => jsonResponse([]) }]);
    await expect(accessTokenFor(env, new Db(env), await account(true))).rejects.toThrow('already in progress');
    expect(calls.some(call => call.url.includes('oauth2'))).toBe(false);
  });

  it('keeps a grant connected after a transient token endpoint outage and releases its lock', async () => {
    const expired = await account(true);
    const { calls } = stubFetch([
      { match: /rpc\/claim_tiktok_refresh/, respond: () => jsonResponse([expired]) },
      { match: /oauth2\/refresh_token/, respond: () => { throw new Error('network timeout'); } },
      { match: /tiktok_accounts\?/, respond: () => jsonResponse([]) },
    ]);
    await expect(accessTokenFor(env, new Db(env), expired)).rejects.toThrow('network timeout');
    const writes = calls.filter(call => call.method === 'PATCH');
    expect(writes.map(call => call.body)).toEqual([{ refresh_locked_until: null }]);
  });

  it('rejects HTML fallbacks and unowned final media URLs', async () => {
    const media = { media_type: 'photo' as const, photo_urls: ['https://example.test/media/outputs/a.jpg'], video_url: null };
    stubFetch([{ match: /media\/outputs/, respond: () => new Response('<html>', { headers: { 'Content-Type': 'text/html' } }) }]);
    await expect(verifyPublishMedia(env, media)).rejects.toThrow('Final media check failed');
    await expect(verifyPublishMedia(env, { ...media, photo_urls: ['https://unowned.test/a.jpg'] })).rejects.toThrow('owned HTTPS');
  });

  it('rejects punctuation/case variants and near-identical hooks', () => {
    expect(isRepeatedHook('What WEIGHT did you use last time?!', ['what weight did you use last time'])).toBe(true);
    expect(isRepeatedHook('What weight did you use the last time?', ['what weight did you use last time'])).toBe(true);
    expect(isRepeatedHook('The set I nearly forgot to log', ['what weight did you use last time'])).toBe(false);
  });

  it('never calls unmeasured or immature results a learned winner', () => {
    const plan = planCreativeFeatures(getCreativePlaybook('deadset')!, ['live_logger', 'workout_plan'],
      [{ id: 'a', hook: 'hook', status: 'published', published_at: '2026-09-01T00:00:00Z', asset_manifest: { feature: 'live_logger' } }],
      [{ artifact_id: 'a', captured_at: '2026-09-01T01:00:00Z', views: 99999, likes: 2000, comments: 100, shares: 100 }],
      2, Date.parse('2026-09-02T00:00:00Z'));
    expect(plan.mode).toBe('learning');
    expect(plan.measured_posts).toBe(0);
    expect(plan.decisions.every(decision => decision.latest_views === null)).toBe(true);
  });

  async function publishingFixture(reserved: boolean, timeout: boolean | 'ownership' | 'preflight' = false, repeatedFirst = false, mode: 'publish' | 'produce' = 'publish', approved = true, legacy = false, visualPass = true, booking?: 'valid' | 'expired' | 'changed' | 'none' | 'cancelled', publishBrand: 'deadset' | 'cast' = 'deadset') {
    if (booking) { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-12T18:58:30Z')); }
    vi.spyOn(independentReview, 'hasPassingVisualReview').mockResolvedValue(visualPass);
    const channel = await account();
    if (publishBrand === 'cast') channel.handle = 'cast.fishing.app';
    const artifact: Artifact = {
      id: 'artifact-1', run_id: null, app_id: 'deadset-id', account_id: channel.id, status: 'approved',
      hook: 'What weight did you use last time?', caption: 'One less thing to guess between sets.',
      hashtags: ['gymtok', 'workoutapp', 'gymprogress'], media_type: 'photo', video_url: null,
      photo_urls: ['https://example.test/media/outputs/one.jpg', 'https://example.test/media/outputs/two.jpg'],
      asset_manifest: { app_slug: publishBrand, format: 'two_slide_photo_carousel', slides: [{}, {}],
        production: { caption_renderer: legacy ? 'tiktok-classic-v2' : CAPTION_RENDERER_VERSION },
        hook_visual_template: { id: getCreativePlaybook('deadset')!.hookVisualTemplate!.id } },
      thumbnail_url: null, duration_s: null, publish_id: null, tiktok_post_id: null, error: null,
      scheduled_for: null, stage: 'schedule', stages: {}, shot_notes: null, script: null,
      tiktok_privacy_level: 'PUBLIC_TO_EVERYONE', disable_comment: false, auto_add_music: true,
      brand_organic_toggle: true, brand_content_toggle: false, is_aigc: false, posting_consent_at: null,
    };
    const repeated = { ...artifact, id: 'repeated-artifact', hook: 'The set I nearly forgot to log',
      error: 'Creative variety hold: this hook repeats recent account content; replace the concept.' };
    const ready = repeatedFirst ? [repeated, artifact] : [artifact];
    for (const item of ready) item.asset_manifest = { ...item.asset_manifest,
      native_visual_review: visualReviewFixture(item.hook, item.caption, item.photo_urls) };
    if (mode === 'produce' && approved) {
      channel.handle = 'cast.fishing.app';
      for (const item of ready) item.asset_manifest = { ...item.asset_manifest, app_slug: 'cast',
        hook_visual_template: { id: getCreativePlaybook('cast')!.hookVisualTemplate!.id } };
    }
    if (approved) for (const item of ready) item.stages = { review: {
      state: 'done', at: new Date().toISOString(), note: await ownerApprovalReceipt(item),
    } };
    if (booking && booking !== 'none') {
      artifact.scheduled_for = booking === 'expired' ? '2026-09-12T10:00:00Z' : '2026-09-12T18:58:00Z';
      artifact.stages.delivery = await timedDeliveryStage(env, artifact, artifact.scheduled_for);
      if (booking === 'changed') artifact.caption = 'Different content after booking';
      if (booking === 'cancelled') artifact.stages.delivery.state = 'cancelled';
    }
    const { calls } = stubFetch([
      { match: /artifacts\?/, respond: call => {
        if (call.method !== 'GET') return jsonResponse([]);
        if (call.url.includes('select=hook')) return jsonResponse(repeatedFirst ? [{ hook: repeated.hook }] : []);
        if (call.url.includes('status=eq.approved')) return jsonResponse(ready);
        if (call.url.includes('status=eq.draft')) return jsonResponse(ready.map(item => ({ ...item, status: 'draft' })));
        return jsonResponse([]);
      } },
      { match: /tiktok_accounts\?/, respond: () => jsonResponse([channel]) },
      { match: /apps\?/, respond: () => jsonResponse([{ id: 'deadset-id', slug: mode === 'produce' && approved ? 'cast' : publishBrand, promotion_enabled: true }]) },
      { match: /promotion_missions\?/, respond: () => jsonResponse([]) },
      { match: /media\/outputs\//, respond: () => new Response(null, { headers: { 'Content-Type': 'image/jpeg' } }) },
      { match: /business\/get\//, respond: () => {
        if (timeout === 'preflight') throw new Error('provider temporarily unavailable');
        return jsonResponse({ code: 0, data: { username: channel.handle } });
      } },
      { match: /business\/video\/settings\//, respond: () => jsonResponse({ code: 0, data: { privacy_level_options: ['PUBLIC_TO_EVERYONE'] } }) },
      { match: /rpc\/reserve_tiktok_delivery/, respond: () => jsonResponse(reserved) },
      { match: /business\/photo\/publish\//, respond: () => {
        if (timeout === 'ownership') return jsonResponse({ code: 40002, message: 'Please review our URL ownership verification rules' });
        if (timeout) throw new Error('network timeout after POST');
        return jsonResponse({ code: 0, data: { share_id: 'test-submission' } });
      } },
    ]);
    const handler = mode === 'publish' ? publishApproved : produceCarousels;
    await handler.run({ env, db: new Db(env), automation: automationRow({ handler_key: handler.key, config: { max_per_run: 1, app_slug: mode === 'produce' && approved ? 'cast' : 'deadset', ...(booking ? { timezone: 'Europe/London', local_hours: [12,15,18,21] } : {}) } }) as unknown as Automation,
      runId: 'test-run', trigger: booking ? 'cron' : 'manual', log: () => {}, setTask: async () => {} });
    return calls;
  }

  it('preserves the exact signed time when provider preflight fails before submission', async () => {
    const calls = await publishingFixture(true, 'preflight', false, 'publish', true, false, true, 'valid');
    expect(calls.some(c => /reserve_tiktok_delivery|photo\/publish/.test(c.url))).toBe(false);
    const failure = calls.find(c => c.method === 'PATCH' && JSON.stringify(c.body).includes('Publish preflight:'));
    expect(failure?.body).toEqual({ error: 'Publish preflight: provider temporarily unavailable' });
  });

  it('reports a non-JSON token failure without leaking response text or revoking the grant', async () => {
    const expired = await account(true);
    const { calls } = stubFetch([
      { match: /rpc\/claim_tiktok_refresh/, respond: () => jsonResponse([expired]) },
      { match: /oauth2\/refresh_token/, respond: () => new Response('Client IP rejected secret-value', { status: 403 }) },
      { match: /tiktok_accounts\?/, respond: () => jsonResponse([]) },
    ]);
    await expect(accessTokenFor(env, new Db(env), expired)).rejects.toThrow('non-JSON response (HTTP 403)');
    expect(calls.filter(c => c.method === 'PATCH').map(c => c.body)).toEqual([{ refresh_locked_until: null }]);
  });

  it('delivers a signed exact-time booking from cron outside ordinary slots', async () => {
    const calls = await publishingFixture(true, false, false, 'publish', true, false, true, 'valid');
    expect(calls.filter(c => /photo\/publish/.test(c.url))).toHaveLength(1);
    expect(calls.find(c => /reserve_tiktok_delivery/.test(c.url))?.body).toMatchObject({
      p_scheduled: false, p_expected: { scheduled_for: '2026-09-12T18:58:00Z' },
    });
  });

  it.each(['expired','changed','none'] as const)('does not deliver %s bookings outside ordinary slots', async booking => {
    const calls = await publishingFixture(true, false, false, 'publish', true, false, true, booking);
    expect(calls.some(c => /reserve_tiktok_delivery|photo\/publish/.test(c.url))).toBe(false);
  });

  it('retains independent review and reservation gates for timed delivery', async () => {
    const failedVisual = await publishingFixture(true, false, false, 'publish', true, false, false, 'valid');
    expect(failedVisual.some(c => /reserve_tiktok_delivery|photo\/publish/.test(c.url))).toBe(false);
    const refusedReservation = await publishingFixture(false, false, false, 'publish', true, false, true, 'valid');
    expect(refusedReservation.some(c => /photo\/publish/.test(c.url))).toBe(false);
  });

  it('does not let the producer reapprove a cancelled delivery', async () => {
    const calls = await publishingFixture(false, false, false, 'produce', false, false, true, 'cancelled');
    expect(calls.filter(c => c.method === 'PATCH').map(c => c.body)).not.toContainEqual(expect.objectContaining({ status: 'approved' }));
  });

  it('does not reserve or publish when the independent visual gate fails', async () => {
    const calls = await publishingFixture(true, false, false, 'publish', true, false, false);
    expect(calls.some(c => /reserve_tiktok_delivery|photo\/publish/.test(c.url))).toBe(false);
    expect(calls.filter(c => c.method === 'PATCH').map(c => c.body)).toContainEqual(expect.objectContaining({ status: 'draft', error: expect.stringContaining('Visual quality hold') }));
  });

  it('does not submit when the atomic slot reservation refuses it', async () => {
    const calls = await publishingFixture(false);
    expect(calls.some(call => call.url.includes('/photo/publish/'))).toBe(false);
    const claim = calls.find(call => call.url.includes('reserve_tiktok_delivery'));
    expect(claim?.body).toMatchObject({ p_artifact_id: 'artifact-1', p_scheduled: false, p_expected: { account_id: 'account-1' } });
  });

  it.each(['deadset', 'cast'] as const)('blocks quality-passed %s content without owner preview approval', async brand => {
    const calls = await publishingFixture(true, false, false, 'publish', false, false, true, undefined, brand);
    expect(calls.some(c => /reserve_tiktok_delivery|photo\/publish/.test(c.url))).toBe(false);
  });

  it('does not auto-approve either brand after owner requests preview first', async () => {
    const calls = await publishingFixture(false, false, false, 'produce', false);
    expect(calls.filter(c => c.method === 'PATCH').map(c => c.body)).not.toContainEqual(expect.objectContaining({ status: 'approved' }));
    expect(automaticCreativeApprovalAllowed('deadset')).toBe(false);
    expect(automaticCreativeApprovalAllowed('cast')).toBe(false);
    expect(automaticCreativeApprovalAllowed('lifescore')).toBe(false);
  });

  it('does not reapprove legacy Deadset exports with the old cropped layout', async () => {
    const calls = await publishingFixture(false, false, false, 'produce', false, true);
    expect(calls.filter(c => c.method === 'PATCH').map(c => c.body)).not.toContainEqual(expect.objectContaining({ status: 'approved' }));
  });

  it('invalidates an owner receipt when content or destination changes', async () => {
    const item = { id: 'one', caption: 'Original', account_id: 'deadset', stages: {} } as Artifact;
    item.stages.review = { state: 'done', at: '2026-09-09T00:00:00Z', note: await ownerApprovalReceipt(item) };
    expect(await hasExactOwnerApproval(item)).toBe(true);
    expect(await hasExactOwnerApproval({ ...item, caption: 'Edited' })).toBe(false);
    expect(await hasExactOwnerApproval({ ...item, account_id: 'cast' })).toBe(false);
    expect(await hasExactOwnerApproval({ ...item, photo_urls: ['https://example.test/new.jpg'] })).toBe(false);
  });

  it('keeps an ambiguous submission locked, never failed/retryable', async () => {
    const calls = await publishingFixture(true, true);
    expect(calls.filter(call => call.url.includes('/photo/publish/'))).toHaveLength(1);
    expect(calls.filter(call => call.method === 'PATCH').map(call => call.body)).toEqual([
      { status: 'publishing', error: expect.stringContaining('do not resubmit') },
    ]);
  });

  it('settles an explicit ownership rejection without requeuing the artifact', async () => {
    const calls = await publishingFixture(true, 'ownership');
    expect(calls.filter(call => call.url.includes('/photo/publish/'))).toHaveLength(1);
    expect(calls.filter(call => call.method === 'PATCH').map(call => call.body)).toEqual([
      { status: 'failed', error: expect.stringContaining('rejected media ownership') },
    ]);
  });

  it('stores the submission ID without claiming that the post is published', async () => {
    const calls = await publishingFixture(true);
    expect(calls.filter(call => call.method === 'PATCH').map(call => call.body)).toEqual([{ publish_id: 'test-submission' }]);
  });

  it('holds a repeated concept without starving the next eligible post for that account', async () => {
    const calls = await publishingFixture(true, false, true);
    expect(calls.filter(call => call.url.includes('/photo/publish/'))).toHaveLength(1);
    expect(calls.filter(call => call.url.includes('reserve_tiktok_delivery')).map(call => call.body))
      .toEqual([expect.objectContaining({ p_artifact_id: 'artifact-1' })]);
    expect(calls.filter(call => call.method === 'PATCH').map(call => call.body)).toEqual([
      { status: 'draft', stage: 'review', error: expect.stringContaining('Creative variety hold') },
      { publish_id: 'test-submission' },
    ]);
  });

  it('keeps both existing and fresh Cast drafts in review after preview-first request', async () => {
    const calls = await publishingFixture(false, false, true, 'produce');
    expect(calls.filter(call => call.method === 'PATCH').map(call => call.body))
      .not.toContainEqual(expect.objectContaining({ status: 'approved' }));
    expect(calls.some(call => call.url.includes('/photo/publish/'))).toBe(false);
  });
});
