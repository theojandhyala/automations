import { env } from 'cloudflare:test';
import { streamMedia, uploadMedia } from '../src/lib/storage';
import type { Env } from '../src/types';
import { describe, expect, it, vi } from 'vitest';
import { putR2Media, streamR2Media } from '../src/lib/r2-media';

declare global {
  namespace Cloudflare { interface Env { MIGRATION_TEST_MEDIA: R2Bucket } }
}

const bucket = env.MIGRATION_TEST_MEDIA;
const bytes = new TextEncoder().encode('0123456789');
const request = (method = 'GET', headers?: HeadersInit) => new Request('https://example.test/media/outputs/test.jpg', { method, headers });

describe('private R2 media migration target', () => {
  it('preserves exact bytes and MIME type, with idempotent imports and no overwrite', async () => {
    const key = `outputs/${crypto.randomUUID()}/slide.jpg`;
    const sha = await putR2Media(bucket, key, bytes, 'image/jpeg');
    expect(await putR2Media(bucket, key, bytes, 'image/jpeg')).toBe(sha);
    await expect(putR2Media(bucket, key, new TextEncoder().encode('changed'), 'image/jpeg')).rejects.toThrow('different bytes');
    const response = await streamR2Media(bucket, key, request());
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/jpeg');
    expect(new TextDecoder().decode(await response.arrayBuffer())).toBe('0123456789');
    const head = await streamR2Media(bucket, key, request('HEAD'));
    expect(head.headers.get('content-length')).toBe('10');
    expect(await head.text()).toBe('');
    const cached = await streamR2Media(bucket, key, request('GET', { 'If-None-Match': head.headers.get('etag')! }));
    expect(cached.status).toBe(304);
  });

  it('serves video ranges and rejects unsatisfiable or malformed ranges', async () => {
    const key = `outputs/${crypto.randomUUID()}/video.mp4`;
    await putR2Media(bucket, key, bytes, 'video/mp4');
    for (const [range, expected, span] of [['bytes=2-5', '2345', '2-5'], ['bytes=-3', '789', '7-9'], ['bytes=8-', '89', '8-9']]) {
      const response = await streamR2Media(bucket, key, request('GET', { Range: range! }));
      expect(response.status).toBe(206);
      expect(response.headers.get('content-range')).toBe(`bytes ${span}/10`);
      expect(new TextDecoder().decode(await response.arrayBuffer())).toBe(expected);
    }
    for (const range of ['bytes=10-', 'bytes=4-2', 'bytes=-0', 'bytes=0-1,4-5']) {
      expect((await streamR2Media(bucket, key, request('GET', { Range: range }))).status).toBe(416);
    }
    const changed = await streamR2Media(bucket, key, request('GET', { Range: 'bytes=2-5', 'If-Range': '"old-version"' }));
    expect(changed.status).toBe(200);
    expect(new TextDecoder().decode(await changed.arrayBuffer())).toBe('0123456789');
  });

  it('never serves private backup keys or treats missing objects as successful media', async () => {
    await bucket.put('private/backup.json', 'secret');
    for (const path of ['private/backup.json', 'outputs/../private/backup.json', 'features//source.png']) {
      expect((await streamR2Media(bucket, path, request())).status).toBe(404);
    }
    expect((await streamR2Media(bucket, 'outputs/missing.jpg', request())).status).toBe(404);
  });
});

it('routes new media to R2 and only falls back for absent legacy objects', async () => {
  const migrated = { ...env, SOCIAL_MEDIA: bucket } as Env;
  const key = `outputs/${crypto.randomUUID()}/slide.jpg`;
  await uploadMedia(migrated, key, bytes, 'image/jpeg');
  const response = await streamMedia(migrated, key, request());
  expect(new TextDecoder().decode(await response.arrayBuffer())).toBe('0123456789');
  expect((await streamMedia(migrated, key, request('GET', { Range: 'bytes=20-' }))).status).toBe(416);
  const upstream=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response('legacy',{headers:{'content-type':'image/jpeg'}}));
  try {
    const legacy=await streamMedia(migrated,'outputs/legacy.jpg',request());
    expect(new TextDecoder().decode(await legacy.arrayBuffer())).toBe('legacy');
    expect(upstream).toHaveBeenCalledWith('https://test.supabase.co/storage/v1/object/authenticated/automation-media/outputs/legacy.jpg',expect.objectContaining({redirect:'manual'}));
  } finally {upstream.mockRestore();}
});
