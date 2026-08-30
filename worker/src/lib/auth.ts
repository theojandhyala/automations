import type { Env } from '../types';

/**
 * Verifies a Supabase access token by asking Supabase who it belongs to, then
 * checks the email against OWNER_EMAIL. Going over the network avoids having to
 * track whichever JWT signing scheme the project is on, and the result is
 * cached for the token's short life.
 */
const cache = new Map<string, { email: string; expires: number }>();
const CACHE_MS = 60_000;

export async function ownerFromRequest(req: Request, env: Env): Promise<string | null> {
  const header = req.headers.get('Authorization');
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice(7);

  const hit = cache.get(token);
  if (hit && hit.expires > Date.now()) {
    return hit.email === env.OWNER_EMAIL ? hit.email : null;
  }

  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;

  const user = (await res.json()) as { email?: string };
  if (!user.email) return null;

  cache.set(token, { email: user.email, expires: Date.now() + CACHE_MS });
  if (cache.size > 100) cache.clear();

  return user.email === env.OWNER_EMAIL ? user.email : null;
}

/**
 * Signed, expiring state for the TikTok OAuth round trip. The callback arrives
 * from TikTok with no session, so the account being connected has to travel in
 * the state parameter without being forgeable.
 */
async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

function toB64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function signState(payload: object, secret: string): Promise<string> {
  const body = toB64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await hmacKey(secret);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)));
  return `${body}.${toB64Url(sig)}`;
}

export async function verifyState<T>(state: string, secret: string): Promise<T | null> {
  const [body, sig] = state.split('.');
  if (!body || !sig) return null;
  const key = await hmacKey(secret);
  const ok = await crypto.subtle.verify('HMAC', key, fromB64Url(sig), new TextEncoder().encode(body));
  if (!ok) return null;

  const payload = JSON.parse(new TextDecoder().decode(fromB64Url(body))) as T & { exp?: number };
  if (payload.exp && payload.exp < Date.now()) return null;
  return payload;
}
