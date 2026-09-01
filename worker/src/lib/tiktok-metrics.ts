import { publishProvider } from './tiktok';
import type { Env, TikTokAccount } from '../types';

/**
 * Read-side of the TikTok API. Split from lib/tiktok.ts because these calls
 * need scopes (`user.info.stats`, `video.list`) the posting flow does not, and
 * an account can legitimately be connected for posting while analytics stays
 * unavailable. Missing scopes are reported, never treated as zeroes.
 */
const API = 'https://open.tiktokapis.com/v2';
const BUSINESS_API = 'https://business-api.tiktok.com/open_api/v1.3';

const SCOPE_ERRORS = new Set(['scope_not_authorized', 'scope_permission_missed', 'access_token_invalid']);

interface ApiEnvelope<T> {
  data?: T;
  error?: { code?: string; message?: string };
}

async function apiCall<T>(
  token: string,
  path: string,
  init: { method: 'GET' | 'POST'; body?: unknown },
): Promise<{ data: T | null; scopeMissing: boolean }> {
  const res = await fetch(`${API}${path}`, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    ...(init.body ? { body: JSON.stringify(init.body) } : {}),
  });

  const json = (await res.json()) as ApiEnvelope<T>;
  const code = json.error?.code;

  if (code && SCOPE_ERRORS.has(code)) {
    return { data: null, scopeMissing: true };
  }
  if (!res.ok || (code && code !== 'ok')) {
    throw new Error(`tiktok ${path}: ${code ?? res.status} ${json.error?.message ?? ''}`.trim());
  }
  return { data: json.data ?? null, scopeMissing: false };
}

export interface AccountStats {
  follower_count?: number;
  following_count?: number;
  likes_count?: number;
  video_count?: number;
  scopeMissing: boolean;
}

export async function accountStats(token: string): Promise<AccountStats> {
  const fields = 'follower_count,following_count,likes_count,video_count';
  const { data, scopeMissing } = await apiCall<{ user: Record<string, number> }>(
    token,
    `/user/info/?fields=${fields}`,
    { method: 'GET' },
  );
  return { ...(data?.user ?? {}), scopeMissing };
}

interface BusinessEnvelope<T> {
  code: number;
  message?: string;
  data?: T;
}

async function businessGet<T>(token: string, path: string, query: Record<string, string>): Promise<T> {
  const url = new URL(`${BUSINESS_API}${path}`);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  const res = await fetch(url, { headers: { 'Access-Token': token } });
  const json = (await res.json()) as BusinessEnvelope<T>;
  if (!res.ok || json.code !== 0 || !json.data) {
    throw new Error(`tiktok business ${path}: ${json.code ?? res.status} ${json.message ?? ''}`.trim());
  }
  return json.data;
}

export async function accountStatsFor(
  env: Env,
  token: string,
  account: TikTokAccount,
): Promise<AccountStats> {
  if (publishProvider(env) !== 'business_accounts') return accountStats(token);
  if (!account.open_id) throw new Error(`@${account.handle} needs reconnecting to TikTok Accounts API`);
  const data = await businessGet<{
    followers_count?: number;
    following_count?: number;
    total_likes?: number;
    videos_count?: number;
  }>(token, '/business/get/', {
    business_id: account.open_id,
    fields: JSON.stringify(['followers_count', 'following_count', 'total_likes', 'videos_count']),
  });
  return {
    follower_count: data.followers_count,
    following_count: data.following_count,
    likes_count: data.total_likes,
    video_count: data.videos_count,
    scopeMissing: false,
  };
}

export interface VideoMetrics {
  id: string;
  view_count?: number;
  like_count?: number;
  comment_count?: number;
  share_count?: number;
}

export async function recentVideos(
  token: string,
  limit: number,
): Promise<{ videos: VideoMetrics[]; scopeMissing: boolean }> {
  const fields = 'id,view_count,like_count,comment_count,share_count';
  const { data, scopeMissing } = await apiCall<{ videos: VideoMetrics[] }>(
    token,
    `/video/list/?fields=${fields}`,
    { method: 'POST', body: { max_count: Math.min(limit, 20) } },
  );
  return { videos: data?.videos ?? [], scopeMissing };
}

export async function recentVideosFor(
  env: Env,
  token: string,
  account: TikTokAccount,
  limit: number,
): Promise<{ videos: VideoMetrics[]; scopeMissing: boolean }> {
  if (publishProvider(env) !== 'business_accounts') return recentVideos(token, limit);
  if (!account.open_id) throw new Error(`@${account.handle} needs reconnecting to TikTok Accounts API`);
  const data = await businessGet<{
    videos?: Array<{
      item_id: string;
      video_views?: number;
      likes?: number;
      comments?: number;
      shares?: number;
    }>;
  }>(token, '/business/video/list/', {
    business_id: account.open_id,
    fields: JSON.stringify(['item_id', 'video_views', 'likes', 'comments', 'shares']),
    max_count: String(Math.min(limit, 20)),
  });
  return {
    videos: (data.videos ?? []).map((video) => ({
      id: video.item_id,
      view_count: video.video_views,
      like_count: video.likes,
      comment_count: video.comments,
      share_count: video.shares,
    })),
    scopeMissing: false,
  };
}
