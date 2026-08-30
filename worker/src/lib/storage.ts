import type { Env } from '../types';

export const MEDIA_BUCKET = 'automation-media';

function objectUrl(env: Env, path: string, authenticated = false): string {
  const encoded = path.split('/').map(encodeURIComponent).join('/');
  const visibility = authenticated ? 'authenticated/' : '';
  return `${env.SUPABASE_URL}/storage/v1/object/${visibility}${MEDIA_BUCKET}/${encoded}`;
}

/** Uploads one bounded media object with the service role; never browser-side. */
export async function uploadMedia(
  env: Env,
  path: string,
  body: ArrayBuffer | Uint8Array,
  contentType: string,
): Promise<void> {
  const response = await fetch(objectUrl(env, path), {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': contentType,
      'x-upsert': 'true',
    },
    body,
  });
  if (!response.ok) {
    throw new Error(`media upload failed (${response.status}): ${await response.text()}`);
  }
}

/** Streams a private Supabase object through the Worker public media route. */
export async function streamMedia(env: Env, path: string, req: Request): Promise<Response> {
  if (!/^(outputs|features)\/[A-Za-z0-9._/-]+$/.test(path) || path.includes('..')) {
    return new Response('not found', { status: 404 });
  }

  const headers: Record<string, string> = {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  };
  const range = req.headers.get('Range');
  if (range) headers.Range = range;

  const upstream = await fetch(objectUrl(env, path, true), { headers });
  if (!upstream.ok) return new Response('not found', { status: upstream.status === 404 ? 404 : 502 });

  const out = new Headers();
  for (const key of ['Content-Type', 'Content-Length', 'Content-Range', 'Accept-Ranges', 'ETag']) {
    const value = upstream.headers.get(key);
    if (value) out.set(key, value);
  }
  out.set('Cache-Control', 'public, max-age=31536000, immutable');
  out.set('X-Content-Type-Options', 'nosniff');
  return new Response(req.method === 'HEAD' ? null : upstream.body, {
    status: upstream.status,
    headers: out,
  });
}

export function publicMediaUrl(env: Env, path: string): string {
  return `${env.PUBLIC_BASE_URL.replace(/\/$/, '')}/media/${path}`;
}

