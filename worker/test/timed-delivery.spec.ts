import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index';
import { timedDeliveryError, timedDeliveryStage } from '../src/lib/timed-delivery';
import * as visual from '../src/lib/creative-visual-review';
import { apiRequest, authRoute, automationRow, jsonResponse, OTHER_TOKEN, stubFetch, testEnv } from './helpers';
import type { Artifact, Env } from '../src/types';

const id = '22222222-2222-4222-8222-222222222222';
const env: Env = { ...testEnv, TIKTOK_PUBLISH_PROVIDER: 'business_accounts', TIKTOK_REVIEW_STATE: 'approved',
  TIKTOK_BUSINESS_CLIENT_ID: 'test-client', TIKTOK_BUSINESS_CLIENT_SECRET: 'test-secret',
  TIKTOK_BUSINESS_AUTH_URL: 'https://example.test/auth', TIKTOK_BUSINESS_REDIRECT_URI: 'https://example.test/callback' };
const artifact = (): Artifact & { updated_at: string } => ({ id, status: 'approved', publish_id: null, caption: 'The inspected caption',
  photo_urls: ['https://example.test/one.jpg'], account_id: 'account-1', stages: {},
  run_id: null, app_id: 'deadset-id', hook: 'The inspected hook', hashtags: [], media_type: 'photo',
  video_url: null, asset_manifest: { app_slug: 'deadset' }, thumbnail_url: null, duration_s: null,
  tiktok_post_id: null, error: null, scheduled_for: null, stage: 'schedule', shot_notes: null, script: null,
  tiktok_privacy_level: 'PUBLIC_TO_EVERYONE', disable_comment: false, auto_add_music: true,
  brand_organic_toggle: true, brand_content_toggle: false, is_aigc: false, posting_consent_at: null,
  updated_at: '2026-09-12T18:00:00Z' });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('durable exact-time delivery booking', () => {
  it('binds content, destination and timing and rejects early or tampered requests', async () => {
    const a = artifact();
    const at = new Date(Date.now() + 60_000).toISOString();
    a.stages.delivery = await timedDeliveryStage(env, a, at);
    expect(await timedDeliveryError(env, a)).toContain('not due');
    expect(await timedDeliveryError(env, a, Date.parse(at) + 1)).toBeNull();
    expect(await timedDeliveryError(env, { ...a, account_id: 'other' }, Date.parse(at) + 1)).toContain('changed');
    a.stages.delivery.at = new Date(Date.now()).toISOString();
    expect(await timedDeliveryError(env, a)).toContain('changed');
    a.stages.delivery.note += 'tampered';
    expect(await timedDeliveryError(env, a)).toContain('signature');
  });

  async function book(options: { token?: string; pass?: boolean; status?: string; cancel?: boolean; conflict?: boolean; hours?: number } = {}) {
    vi.spyOn(visual, 'hasPassingVisualReview').mockResolvedValue(options.pass ?? true);
    const a = { ...artifact(), status: options.status ?? 'approved' };
    const { calls } = stubFetch([authRoute,
      { match: /artifacts\?/, respond: call => jsonResponse(call.method === 'GET' ? [a] : options.conflict ? [] : [{ ...a, ...(call.body as object) }]) },
      { match: /automations\?/, respond: () => jsonResponse([automationRow({ handler_key: 'tiktok.publish', cron: '* * * * *', enabled: true })]) },
    ]);
    const ctx = createExecutionContext();
    const res = await worker.fetch(apiRequest(`/artifacts/${id}/delivery`, {
      method: options.cancel ? 'DELETE' : 'POST', token: options.token,
      ...(!options.cancel ? { body: JSON.stringify({ at: new Date(Date.now() + (options.hours ?? 1) * 3600_000).toISOString() }) } : {}),
    }), env, ctx);
    await waitOnExecutionContext(ctx);
    return { res, calls };
  }

  it('saves a signed booking without launching an HTTP background publisher', async () => {
    const { res, calls } = await book();
    expect(res.status).toBe(202);
    const row = await res.json() as Artifact;
    expect(row.stages.delivery?.state).toBe('scheduled');
    expect(await timedDeliveryError(env, row, Date.parse(row.scheduled_for!) + 1)).toBeNull();
    expect(calls.some(c => /claim_automation|photo\/publish/.test(c.url))).toBe(false);
  });
  it('rejects non-owner access without writing anything', async () => {
    const { res, calls } = await book({ token: OTHER_TOKEN });
    expect(res.status).toBe(401);
    expect(calls.some(c => c.method === 'PATCH')).toBe(false);
  });
  it.each([{ pass: false }, { status: 'publishing' }, { conflict: true }])('fails closed for %j', async options => {
    expect((await book(options)).res.status).toBe(409);
  });
  it('rejects past delivery dates rather than silently replaying them', async () => {
    expect((await book({ hours: -1 })).res.status).toBe(400);
  });
  it('cancels back to draft so it cannot leak into a normal slot', async () => {
    const { res } = await book({ cancel: true });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'draft', stages: { delivery: { state: 'cancelled' } } });
  });
});
