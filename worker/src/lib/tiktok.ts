import { Db } from './db';
import { decrypt, encrypt } from './crypto';
import type { Env, TikTokAccount } from '../types';

const API = 'https://open.tiktokapis.com/v2';
const AUTH = 'https://www.tiktok.com/v2/auth/authorize/';

/** Scopes the dashboard needs: read the creator's posting options, then post. */
export const SCOPES = ['user.info.basic', 'video.publish', 'video.upload'];

export function authorizeUrl(env: Env, state: string): string {
  if (!env.TIKTOK_CLIENT_KEY || !env.TIKTOK_REDIRECT_URI) {
    throw new Error('TIKTOK_CLIENT_KEY and TIKTOK_REDIRECT_URI must be configured');
  }
  const params = new URLSearchParams({
    client_key: env.TIKTOK_CLIENT_KEY,
    scope: SCOPES.join(','),
    response_type: 'code',
    redirect_uri: env.TIKTOK_REDIRECT_URI,
    state,
  });
  return `${AUTH}?${params}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  open_id: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

async function tokenRequest(env: Env, body: Record<string, string>): Promise<TokenResponse> {
  if (!env.TIKTOK_CLIENT_KEY || !env.TIKTOK_CLIENT_SECRET) {
    throw new Error('TikTok client credentials are not configured');
  }
  const res = await fetch(`${API}/oauth/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key: env.TIKTOK_CLIENT_KEY,
      client_secret: env.TIKTOK_CLIENT_SECRET,
      ...body,
    }),
  });
  const json = (await res.json()) as TokenResponse;
  if (!res.ok || json.error) {
    throw new Error(`tiktok token: ${json.error ?? res.status} ${json.error_description ?? ''}`.trim());
  }
  return json;
}

export function exchangeCode(env: Env, code: string): Promise<TokenResponse> {
  return tokenRequest(env, {
    code,
    grant_type: 'authorization_code',
    redirect_uri: env.TIKTOK_REDIRECT_URI ?? '',
  });
}

/** Persist a token pair against an account row, encrypted. */
export async function storeTokens(
  env: Env,
  db: Db,
  accountId: string,
  tokens: TokenResponse,
): Promise<void> {
  await db.update('tiktok_accounts', `id=eq.${accountId}`, {
    open_id: tokens.open_id,
    access_token_enc: await encrypt(tokens.access_token, env.TOKEN_ENCRYPTION_KEY),
    refresh_token_enc: await encrypt(tokens.refresh_token, env.TOKEN_ENCRYPTION_KEY),
    token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    status: 'connected',
  });
}

/**
 * Returns a usable access token for an account, refreshing it first if it
 * expires within five minutes. Marks the account 'expired' and throws if the
 * refresh token is no longer accepted -- that needs a human to reconnect.
 */
export async function accessTokenFor(env: Env, db: Db, account: TikTokAccount): Promise<string> {
  if (!account.access_token_enc || !account.refresh_token_enc) {
    throw new Error(`account @${account.handle} is not connected`);
  }

  const expiresAt = account.token_expires_at ? Date.parse(account.token_expires_at) : 0;
  if (expiresAt - Date.now() > 5 * 60 * 1000) {
    return decrypt(account.access_token_enc, env.TOKEN_ENCRYPTION_KEY);
  }

  const refreshToken = await decrypt(account.refresh_token_enc, env.TOKEN_ENCRYPTION_KEY);
  try {
    const tokens = await tokenRequest(env, {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });
    await storeTokens(env, db, account.id, tokens);
    return tokens.access_token;
  } catch (err) {
    await db.update('tiktok_accounts', `id=eq.${account.id}`, { status: 'expired' });
    throw new Error(`@${account.handle} needs reconnecting: ${err instanceof Error ? err.message : err}`);
  }
}

async function apiPost<T>(token: string, path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { data?: T; error?: { code?: string; message?: string } };
  // TikTok returns 200 with error.code = 'ok' on success.
  if (!res.ok || (json.error?.code && json.error.code !== 'ok')) {
    throw new Error(`tiktok ${path}: ${json.error?.code ?? res.status} ${json.error?.message ?? ''}`.trim());
  }
  return json.data as T;
}

export interface CreatorInfo {
  creator_avatar_url?: string;
  creator_username: string;
  creator_nickname: string;
  privacy_level_options: string[];
  comment_disabled: boolean;
  duet_disabled: boolean;
  stitch_disabled: boolean;
  max_video_post_duration_sec: number;
}

/**
 * TikTok requires querying the creator's current posting options immediately
 * before publishing -- a privacy level the account does not offer is rejected.
 */
export function creatorInfo(token: string): Promise<CreatorInfo> {
  return apiPost<CreatorInfo>(token, '/post/publish/creator_info/query/', {});
}

export interface PublishInit {
  publish_id: string;
}

/**
 * Starts a PULL_FROM_URL publish: TikTok fetches the video itself, so the
 * Worker never has to stream bytes. `videoUrl` must be on a domain verified in
 * the TikTok developer console.
 */
export function initVideoPublish(
  token: string,
  opts: {
    title: string;
    videoUrl: string;
    privacyLevel: string;
    disableComment: boolean;
    brandOrganic: boolean;
    brandContent: boolean;
    isAigc: boolean;
  },
): Promise<PublishInit> {
  return apiPost<PublishInit>(token, '/post/publish/video/init/', {
    post_info: {
      title: opts.title,
      privacy_level: opts.privacyLevel,
      // Interaction permissions are off unless the owner explicitly enables
      // them in the review UI. Photo posts only expose comments.
      disable_duet: true,
      disable_comment: opts.disableComment,
      disable_stitch: true,
      brand_organic_toggle: opts.brandOrganic,
      brand_content_toggle: opts.brandContent,
      is_aigc: opts.isAigc,
    },
    source_info: {
      source: 'PULL_FROM_URL',
      video_url: opts.videoUrl,
    },
  });
}

/** Starts a native TikTok photo carousel publish from verified HTTPS URLs. */
export function initPhotoPublish(
  token: string,
  opts: {
    title: string;
    description: string;
    photoUrls: string[];
    privacyLevel: string;
    disableComment: boolean;
    autoAddMusic: boolean;
    brandOrganic: boolean;
    brandContent: boolean;
  },
): Promise<PublishInit> {
  return apiPost<PublishInit>(token, '/post/publish/content/init/', {
    post_info: {
      title: opts.title.slice(0, 90),
      description: opts.description.slice(0, 4000),
      privacy_level: opts.privacyLevel,
      disable_comment: opts.disableComment,
      auto_add_music: opts.autoAddMusic,
      brand_organic_toggle: opts.brandOrganic,
      brand_content_toggle: opts.brandContent,
    },
    source_info: {
      source: 'PULL_FROM_URL',
      photo_images: opts.photoUrls,
      photo_cover_index: 0,
    },
    post_mode: 'DIRECT_POST',
    media_type: 'PHOTO',
  });
}

export interface PublishStatus {
  status: string; // PROCESSING_UPLOAD | PUBLISH_COMPLETE | FAILED ...
  fail_reason?: string;
  publicaly_available_post_id?: string[];
}

export function publishStatus(token: string, publishId: string): Promise<PublishStatus> {
  return apiPost<PublishStatus>(token, '/post/publish/status/fetch/', { publish_id: publishId });
}
