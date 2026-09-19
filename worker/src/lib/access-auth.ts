import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type { Env } from '../types';

type AccessEnv = Pick<Env, 'OWNER_EMAIL' | 'PUBLIC_BASE_URL'> & { ACCESS_TEAM_DOMAIN?: string; ACCESS_AUD?: string };
const resolvers = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export async function verifyAccessToken(token: string, env: AccessEnv, resolveKey?: JWTVerifyGetKey): Promise<string | null> {
  if (!env.ACCESS_AUD || !env.ACCESS_TEAM_DOMAIN || token.length > 16384) return null;
  if (!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.ACCESS_TEAM_DOMAIN)) return null;
  try {
    let key = resolveKey ?? resolvers.get(env.ACCESS_TEAM_DOMAIN);
    if (!key) {
      key = createRemoteJWKSet(new URL(`${env.ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`));
      resolvers.set(env.ACCESS_TEAM_DOMAIN, key as ReturnType<typeof createRemoteJWKSet>);
    }
    const { payload } = await jwtVerify(token, key, {
      issuer: env.ACCESS_TEAM_DOMAIN,
      audience: env.ACCESS_AUD,
      algorithms: ['RS256'],
      requiredClaims: ['exp', 'iat', 'sub', 'email'],
    });
    return payload.email === env.OWNER_EMAIL ? env.OWNER_EMAIL : null;
  } catch { return null; }
}

export function accessTokenFromRequest(req: Request): string | null {
  const assertion = req.headers.get('Cf-Access-Jwt-Assertion');
  if (assertion) return assertion;
  const cookies = (req.headers.get('Cookie') ?? '').split(';').map(s => s.trim()).filter(s => s.startsWith('CF_Authorization='));
  return cookies.length === 1 ? cookies[0]!.slice('CF_Authorization='.length) : null;
}

export function accessRequestHasSafeOrigin(req: Request, env: AccessEnv): boolean {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return true;
  // Cookie-authenticated mutations require a same-origin browser request.
  // A public hostname alone is never an identity or an authorization grant.
  return req.headers.get('Origin') === new URL(env.PUBLIC_BASE_URL).origin
    && new URL(req.url).origin === new URL(env.PUBLIC_BASE_URL).origin;
}

export async function accessOwnerFromRequest(req: Request, env: AccessEnv): Promise<string | null> {
  const token = accessTokenFromRequest(req);
  if (!token || !accessRequestHasSafeOrigin(req, env)) return null;
  return verifyAccessToken(token, env);
}
