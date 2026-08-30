/**
 * Read-side of the TikTok API. Split from lib/tiktok.ts because these calls
 * need scopes (`user.info.stats`, `video.list`) the posting flow does not, and
 * an account can legitimately be connected for posting while analytics stays
 * unavailable. Missing scopes are reported, never treated as zeroes.
 */
const API = 'https://open.tiktokapis.com/v2';

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
