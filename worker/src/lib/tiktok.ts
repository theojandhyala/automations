import { Db } from './db';
import { decrypt, encrypt } from './crypto';
import type { Env, TikTokAccount } from '../types';

const API = 'https://open.tiktokapis.com/v2';
const AUTH = 'https://www.tiktok.com/v2/auth/authorize/';
const BUSINESS_API = 'https://business-api.tiktok.com/open_api/v1.3';

export type TikTokPublishProvider = 'content_posting' | 'business_accounts';

export function publishProvider(env: Pick<Env, 'TIKTOK_PUBLISH_PROVIDER'>): TikTokPublishProvider {
  return env.TIKTOK_PUBLISH_PROVIDER === 'business_accounts'
    ? 'business_accounts'
    : 'content_posting';
}

export function businessAccountsConfigured(env: Env): boolean {
  return Boolean(
    env.TIKTOK_BUSINESS_CLIENT_ID
      && env.TIKTOK_BUSINESS_CLIENT_SECRET
      && env.TIKTOK_BUSINESS_AUTH_URL
      && env.TIKTOK_BUSINESS_REDIRECT_URI,
  );
}

/** TikTok Accounts API is the only provider that permits owned-account posts without per-post consent. */
export function unattendedPublishingEnabled(env: Env): boolean {
  return publishProvider(env) === 'business_accounts'
    && env.TIKTOK_REVIEW_STATE === 'approved'
    && businessAccountsConfigured(env);
}

/** Scopes used by the reviewed publishing and performance-learning loop. */
export const POSTING_SCOPES = ['user.info.basic', 'video.publish', 'video.upload'];
export const ANALYTICS_SCOPES = ['user.info.stats', 'video.list'];
export const SANDBOX_SCOPES = ['user.info.basic'];

/**
 * TikTok sandbox guarantees Login Kit's baseline identity scope, while public
 * posting remains unavailable before production review. Requesting every
 * optional posting and analytics scope in one pre-review authorization can
 * make TikTok reject the whole request with a generic `scope` error.
 */
export function oauthScopes(reviewState: string | undefined): string[] {
  // The configured Sandbox contains Login Kit + Content Posting API, so it
  // may request the posting scopes needed for TikTok's required review demo.
  // Production still remains locked until the environment is `approved`.
  return reviewState === 'approved' || reviewState === 'sandbox'
    ? POSTING_SCOPES
    : SANDBOX_SCOPES;
}

/** Unreviewed Sandbox clients may only create private test posts. */
export function isDirectPostPrivacyAllowed(reviewState: string | undefined, privacy: string): boolean {
  return reviewState !== 'sandbox' || privacy === 'SELF_ONLY';
}

export function authorizeUrl(env: Env, state: string): string {
  if (publishProvider(env) === 'business_accounts') {
    if (!businessAccountsConfigured(env)) {
      throw new Error('TikTok Business Accounts credentials and authorization URL are not configured');
    }
    const url = new URL(env.TIKTOK_BUSINESS_AUTH_URL!);
    url.searchParams.set('state', state);
    return url.toString();
  }
  if (!env.TIKTOK_CLIENT_KEY || !env.TIKTOK_REDIRECT_URI) {
    throw new Error('TIKTOK_CLIENT_KEY and TIKTOK_REDIRECT_URI must be configured');
  }
  const params = new URLSearchParams({
    client_key: env.TIKTOK_CLIENT_KEY,
    scope: oauthScopes(env.TIKTOK_REVIEW_STATE).join(','),
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

interface BusinessEnvelope<T> {
  code: number;
  message?: string;
  request_id?: string;
  data?: T;
}

async function businessTokenRequest(
  env: Env,
  path: '/tt_user/oauth2/token/' | '/tt_user/oauth2/refresh_token/',
  body: Record<string, string>,
): Promise<TokenResponse> {
  if (!env.TIKTOK_BUSINESS_CLIENT_ID || !env.TIKTOK_BUSINESS_CLIENT_SECRET) {
    throw new Error('TikTok Business Accounts client credentials are not configured');
  }
  const res = await fetch(`${BUSINESS_API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: env.TIKTOK_BUSINESS_CLIENT_ID,
      client_secret: env.TIKTOK_BUSINESS_CLIENT_SECRET,
      ...body,
    }),
  });
  const json = (await res.json()) as BusinessEnvelope<TokenResponse>;
  if (!res.ok || json.code !== 0 || !json.data) {
    throw new Error(
      `tiktok business token: ${json.code ?? res.status} ${json.message ?? ''}`.trim(),
    );
  }
  return json.data;
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
  if (publishProvider(env) === 'business_accounts') {
    return businessTokenRequest(env, '/tt_user/oauth2/token/', {
      auth_code: code,
      grant_type: 'authorization_code',
      redirect_uri: env.TIKTOK_BUSINESS_REDIRECT_URI ?? '',
    });
  }
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
    const tokens = publishProvider(env) === 'business_accounts'
      ? await businessTokenRequest(env, '/tt_user/oauth2/refresh_token/', {
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        })
      : await tokenRequest(env, {
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

async function businessApi<T>(
  token: string,
  path: string,
  init: { method: 'GET' | 'POST'; body?: unknown; query?: Record<string, string> },
): Promise<T> {
  const url = new URL(`${BUSINESS_API}${path}`);
  for (const [key, value] of Object.entries(init.query ?? {})) url.searchParams.set(key, value);
  const res = await fetch(url, {
    method: init.method,
    headers: {
      'Access-Token': token,
      'Content-Type': 'application/json',
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
  const json = (await res.json()) as BusinessEnvelope<T>;
  if (!res.ok || json.code !== 0 || !json.data) {
    throw new Error(
      `tiktok business ${path}: ${json.code ?? res.status} ${json.message ?? ''}`.trim(),
    );
  }
  return json.data;
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

/** Provider-aware settings check performed immediately before every publish. */
export async function postingInfo(env: Env, token: string, account: TikTokAccount): Promise<CreatorInfo> {
  if (publishProvider(env) !== 'business_accounts') return creatorInfo(token);
  if (!account.open_id) throw new Error(`@${account.handle} needs reconnecting to TikTok Accounts API`);
  const settings = await businessApi<Omit<CreatorInfo, 'creator_username' | 'creator_nickname'>>(
    token,
    '/business/video/settings/',
    { method: 'GET', query: { business_id: account.open_id } },
  );
  return {
    ...settings,
    creator_username: account.handle,
    creator_nickname: account.display_name ?? account.handle,
  };
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

/** Starts an unattended owned-account photo carousel through TikTok API for Business. */
export async function initOwnedPhotoPublish(
  token: string,
  businessId: string,
  opts: {
    title: string;
    caption: string;
    photoUrls: string[];
    privacyLevel: string;
    disableComment: boolean;
    autoAddMusic: boolean;
    brandOrganic: boolean;
    brandContent: boolean;
  },
): Promise<PublishInit> {
  const data = await businessApi<{ share_id: string }>(token, '/business/photo/publish/', {
    method: 'POST',
    body: {
      business_id: businessId,
      photo_images: opts.photoUrls,
      photo_cover_index: 0,
      post_info: {
        title: opts.title.slice(0, 90),
        caption: opts.caption.slice(0, 4000),
        privacy_level: opts.privacyLevel,
        disable_comment: opts.disableComment,
        auto_add_music: opts.autoAddMusic,
        is_brand_organic: opts.brandOrganic,
        is_branded_content: opts.brandContent,
      },
    },
  });
  return { publish_id: data.share_id };
}

export interface PublishStatus {
  status: string; // PROCESSING_UPLOAD | PUBLISH_COMPLETE | FAILED ...
  fail_reason?: string;
  publicaly_available_post_id?: string[];
}

export function publishStatus(token: string, publishId: string): Promise<PublishStatus> {
  return apiPost<PublishStatus>(token, '/post/publish/status/fetch/', { publish_id: publishId });
}

/** Provider-aware publishing status normalized to the Content Posting API shape. */
export async function publishStatusFor(
  env: Env,
  token: string,
  account: TikTokAccount,
  publishId: string,
): Promise<PublishStatus> {
  if (publishProvider(env) !== 'business_accounts') return publishStatus(token, publishId);
  if (!account.open_id) throw new Error(`@${account.handle} needs reconnecting to TikTok Accounts API`);
  const data = await businessApi<{ status: string; post_ids?: string[]; reason?: string }>(
    token,
    '/business/publish/status/',
    {
      method: 'GET',
      query: { business_id: account.open_id, publish_id: publishId },
    },
  );
  return {
    status: data.status,
    fail_reason: data.reason,
    publicaly_available_post_id: data.post_ids,
  };
}
