import { afterEach, expect, it, vi } from 'vitest';
import { mediaProperty } from '../src/lib/tiktok-property';
const env = { TIKTOK_BUSINESS_CLIENT_ID: 'app', TIKTOK_BUSINESS_CLIENT_SECRET: 'private-test' } as never;
afterEach(() => vi.unstubAllGlobals());
it('registers only the owned prefix with server-held credentials', async () => {
  const fetcher = vi.fn(async () => Response.json({ code: 0, data: { url_property_info: { property_status: 0 } } }));
  vi.stubGlobal('fetch', fetcher);
  await mediaProperty(env, 'add');
  const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
  expect(new URL(url).pathname).toBe('/open_api/v1.3/business/property/add/');
  expect(JSON.parse(init.body as string).url_property_meta).toEqual({ property_type: 2, url: 'https://automations.theojandhyala.workers.dev/' });
  expect(init.redirect).toBe('manual');
});
it('does not expose upstream error messages containing credentials', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('private-test'); }));
  await expect(mediaProperty(env, 'list')).rejects.toThrow('no credentials were logged');
});
it('reports platform error code without returning upstream secret echoes', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ code: 40002, message: 'private-test' })));
  await expect(mediaProperty(env, 'verify')).rejects.toThrow('TikTok property error 40002');
});
