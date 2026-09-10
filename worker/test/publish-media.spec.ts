import { env } from 'cloudflare:test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { verifyPublishMedia } from '../src/lib/publish-media';

afterEach(() => vi.restoreAllMocks());
describe('publisher owned media preflight', () => {
  const artifact = { media_type: 'photo' as const, photo_urls: ['https://example.test/media/outputs/post/slide.jpg'], video_url: null };
  it('uses the public media handler storage path, never a workers.dev self fetch', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('jpeg', { headers: { 'content-type': 'image/jpeg' } }));
    await expect(verifyPublishMedia(env, artifact)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('https://test.supabase.co/storage/v1/object/authenticated/automation-media/outputs/post/slide.jpg');
  });
  it('still rejects missing media', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 404 }));
    await expect(verifyPublishMedia(env, artifact)).rejects.toThrow('Final media check failed (404');
  });
  it('still rejects an HTML fallback', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('html', { headers: { 'content-type': 'text/html' } }));
    await expect(verifyPublishMedia(env, artifact)).rejects.toThrow('Final media check failed (200, text/html)');
  });
  it('rejects foreign media before sending credentials', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    await expect(verifyPublishMedia(env, { ...artifact, photo_urls: ['https://other.test/media/outputs/a.jpg'] })).rejects.toThrow('owned HTTPS');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
