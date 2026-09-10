import type { Env } from '../types';

// TikTok Business docs 1769325280876545 / 1769325308162050 / 1769325368603650.
// Only the deployed media origin can be registered; credentials never leave the server.
export async function mediaProperty(env: Env, action: 'list' | 'add' | 'verify') {
  if (!env.TIKTOK_BUSINESS_CLIENT_ID || !env.TIKTOK_BUSINESS_CLIENT_SECRET) {
    throw new Error('Business app credentials are not configured');
  }
  const credentials = { app_id: env.TIKTOK_BUSINESS_CLIENT_ID, secret: env.TIKTOK_BUSINESS_CLIENT_SECRET };
  const endpoint = new URL(`https://business-api.tiktok.com/open_api/v1.3/business/property/${action}/`);
  const init: RequestInit = { redirect: 'manual', signal: AbortSignal.timeout(15000) };
  if (action === 'list') {
    endpoint.search = new URLSearchParams(credentials).toString();
  } else {
    init.method = 'POST';
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify({ ...credentials, url_property_meta: {
      property_type: 2, url: 'https://automations.theojandhyala.workers.dev/',
    } });
  }
  // Never log an upstream URL/error object: the list API requires a secret query parameter.
  let response: Response;
  try { response = await fetch(endpoint.toString(), init); }
  catch { throw new Error('TikTok property request failed; no credentials were logged'); }
  if (!response.ok) throw new Error(`TikTok property HTTP ${response.status}`);
  const result = await response.json() as { code: number; data?: unknown };
  if (result.code !== 0) throw new Error(`TikTok property error ${result.code}`);
  return result.data;
}
