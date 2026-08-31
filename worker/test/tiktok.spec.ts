import { afterEach, describe, expect, it, vi } from 'vitest';
import { authorizeUrl, initPhotoPublish, oauthScopes } from '../src/lib/tiktok';

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

  it('requests the complete publishing and learning loop after production approval', () => {
    expect(oauthScopes('approved')).toEqual([
      'user.info.basic',
      'video.publish',
      'video.upload',
      'user.info.stats',
      'video.list',
    ]);
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
});
