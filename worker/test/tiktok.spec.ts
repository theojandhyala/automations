import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  authorizeUrl,
  initOwnedPhotoPublish,
  initPhotoPublish,
  isDirectPostPrivacyAllowed,
  oauthScopes,
  unattendedPublishingEnabled,
} from '../src/lib/tiktok';
import { isPostingSlot, missionRoutingError, startOfLocalDay } from '../src/automations/tiktok-publish';

afterEach(() => vi.unstubAllGlobals());

describe('TikTok OAuth scopes', () => {
  it('requests only Login Kit identity while the app is in sandbox review', () => {
    expect(oauthScopes('draft')).toEqual(['user.info.basic']);
    const url = new URL(authorizeUrl({
      TIKTOK_CLIENT_KEY: 'sandbox-key',
      TIKTOK_REDIRECT_URI: 'https://example.test/api/tiktok/callback',
      TIKTOK_REVIEW_STATE: 'draft',
    } as never, 'signed-state'));
    expect(url.searchParams.get('scope')).toBe('user.info.basic');
  });

  it('requests only the posting scopes after production approval', () => {
    expect(oauthScopes('approved')).toEqual([
      'user.info.basic',
      'video.publish',
      'video.upload',
    ]);
  });

  it('requests posting scopes in the configured review sandbox', () => {
    expect(oauthScopes('sandbox')).toEqual([
      'user.info.basic',
      'video.publish',
      'video.upload',
    ]);
  });

  it('restricts sandbox Direct Post to private test visibility', () => {
    expect(isDirectPostPrivacyAllowed('sandbox', 'SELF_ONLY')).toBe(true);
    expect(isDirectPostPrivacyAllowed('sandbox', 'PUBLIC_TO_EVERYONE')).toBe(false);
    expect(isDirectPostPrivacyAllowed('approved', 'PUBLIC_TO_EVERYONE')).toBe(true);
  });
});

describe('TikTok photo publishing', () => {
  it('uses the native photo endpoint and carries creator-selected disclosure settings', async () => {
    let request: Request | null = null;
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      request = new Request(input, init);
      return new Response(JSON.stringify({
        data: { publish_id: 'p_pub_url~v2.test' },
        error: { code: 'ok', message: '' },
      }), { headers: { 'Content-Type': 'application/json' } });
    });

    const result = await initPhotoPublish('token', {
      title: 'who are you doing this for?',
      description: 'for me. deadset on appstore #gymtok',
      photoUrls: [
        'https://media.example/one.webp',
        'https://media.example/two.webp',
      ],
      privacyLevel: 'SELF_ONLY',
      disableComment: false,
      autoAddMusic: true,
      brandOrganic: true,
      brandContent: false,
    });

    expect(result.publish_id).toBe('p_pub_url~v2.test');
    expect(request).not.toBeNull();
    const sent = request as unknown as Request;
    expect(new URL(sent.url).pathname).toBe('/v2/post/publish/content/init/');
    const body = await sent.json() as Record<string, any>;
    expect(body).toMatchObject({
      media_type: 'PHOTO',
      post_mode: 'DIRECT_POST',
      post_info: {
        privacy_level: 'SELF_ONLY',
        disable_comment: false,
        auto_add_music: true,
        brand_organic_toggle: true,
        brand_content_toggle: false,
      },
      source_info: {
        source: 'PULL_FROM_URL',
        photo_cover_index: 0,
        photo_images: [
          'https://media.example/one.webp',
          'https://media.example/two.webp',
        ],
      },
    });
  });

  it('uses the owned-account carousel endpoint for unattended public posts', async () => {
    let request: Request | null = null;
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      request = new Request(input, init);
      return new Response(JSON.stringify({
        code: 0,
        message: 'OK',
        data: { share_id: 'p_pub_url~v1.business' },
      }), { headers: { 'Content-Type': 'application/json' } });
    });

    const result = await initOwnedPhotoPublish('business-token', 'open-id', {
      title: 'one more set?',
      caption: 'the progress is right there #GymTok #Deadset',
      photoUrls: ['https://media.example/one.jpg', 'https://media.example/two.jpg'],
      privacyLevel: 'PUBLIC_TO_EVERYONE',
      disableComment: false,
      autoAddMusic: true,
      brandOrganic: true,
      brandContent: false,
    });

    expect(result.publish_id).toBe('p_pub_url~v1.business');
    const sent = request as unknown as Request;
    expect(new URL(sent.url).pathname).toBe('/open_api/v1.3/business/photo/publish/');
    expect(sent.headers.get('Access-Token')).toBe('business-token');
    expect(await sent.json()).toMatchObject({
      business_id: 'open-id',
      photo_images: ['https://media.example/one.jpg', 'https://media.example/two.jpg'],
      photo_cover_index: 0,
      post_info: {
        caption: 'the progress is right there #GymTok #Deadset',
        privacy_level: 'PUBLIC_TO_EVERYONE',
        auto_add_music: true,
        is_brand_organic: true,
        is_branded_content: false,
      },
    });
  });

  it('enables auto-approval only for an approved and fully configured owned-account app', () => {
    expect(unattendedPublishingEnabled({
      TIKTOK_PUBLISH_PROVIDER: 'business_accounts',
      TIKTOK_REVIEW_STATE: 'approved',
      TIKTOK_BUSINESS_CLIENT_ID: 'id',
      TIKTOK_BUSINESS_CLIENT_SECRET: 'secret',
      TIKTOK_BUSINESS_AUTH_URL: 'https://www.tiktok.com/v2/auth/authorize?client_key=id',
      TIKTOK_BUSINESS_REDIRECT_URI: 'https://example.test/api/tiktok/callback/',
    } as never)).toBe(true);
    expect(unattendedPublishingEnabled({
      TIKTOK_PUBLISH_PROVIDER: 'business_accounts',
      TIKTOK_REVIEW_STATE: 'sandbox',
      TIKTOK_BUSINESS_CLIENT_ID: 'id',
      TIKTOK_BUSINESS_CLIENT_SECRET: 'secret',
      TIKTOK_BUSINESS_AUTH_URL: 'https://www.tiktok.com/v2/auth/authorize?client_key=id',
      TIKTOK_BUSINESS_REDIRECT_URI: 'https://example.test/api/tiktok/callback/',
    } as never)).toBe(false);
  });
});

describe('UK posting windows', () => {
  const slots = [12, 15, 18];

  it('keeps 12:00, 15:00 and 18:00 local through BST and GMT', () => {
    expect(isPostingSlot(new Date('2026-09-02T11:00:00Z'), 'Europe/London', slots)).toBe(true);
    expect(isPostingSlot(new Date('2026-09-02T12:00:00Z'), 'Europe/London', slots)).toBe(false);
    expect(isPostingSlot(new Date('2026-09-02T14:00:00Z'), 'Europe/London', slots)).toBe(true);
    expect(isPostingSlot(new Date('2026-09-02T17:00:00Z'), 'Europe/London', slots)).toBe(true);
    expect(isPostingSlot(new Date('2026-09-02T17:04:59Z'), 'Europe/London', slots)).toBe(true);
    expect(isPostingSlot(new Date('2026-09-02T17:05:00Z'), 'Europe/London', slots)).toBe(false);
    expect(isPostingSlot(new Date('2026-12-02T12:00:00Z'), 'Europe/London', slots)).toBe(true);
    expect(isPostingSlot(new Date('2026-12-02T15:00:00Z'), 'Europe/London', slots)).toBe(true);
    expect(isPostingSlot(new Date('2026-12-02T18:00:00Z'), 'Europe/London', slots)).toBe(true);
  });

  it('enforces the limit per London calendar day rather than a rolling 24 hours', () => {
    expect(startOfLocalDay(new Date('2026-09-02T19:00:00Z'), 'Europe/London').toISOString())
      .toBe('2026-09-01T23:00:00.000Z');
    expect(startOfLocalDay(new Date('2026-12-02T20:00:00Z'), 'Europe/London').toISOString())
      .toBe('2026-12-02T00:00:00.000Z');
  });
});

describe('TikTok mission routing interlock', () => {
  const deadsetArtifact = {
    app_id: 'deadset-app',
    asset_manifest: { app_slug: 'deadset' },
  } as const;
  const deadsetAccount = { app_id: 'deadset-app' } as const;
  const deadsetApp = { id: 'deadset-app', slug: 'deadset', promotion_enabled: true } as const;

  it('allows a verified creative only on its matching active account mission', () => {
    expect(missionRoutingError(deadsetArtifact as never, deadsetAccount, deadsetApp)).toBeNull();
  });

  it('blocks cross-account, cross-content and unreleased mission routes', () => {
    expect(missionRoutingError(deadsetArtifact as never, { app_id: 'cast-app' }, deadsetApp))
      .toMatch(/different app missions/);
    expect(missionRoutingError(
      { ...deadsetArtifact, asset_manifest: { app_slug: 'cast' } } as never,
      deadsetAccount,
      deadsetApp,
    )).toMatch(/not verified for deadset/);
    expect(missionRoutingError(
      { app_id: 'lifescore-app', asset_manifest: { app_slug: 'lifescore' } } as never,
      { app_id: 'lifescore-app' },
      { id: 'lifescore-app', slug: 'lifescore', promotion_enabled: false },
    )).toMatch(/publishing is locked/);
  });
});
