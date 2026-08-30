export interface Env {
  ASSETS: Fetcher;

  // vars
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  OWNER_EMAIL: string;

  // secrets (wrangler secret put ...)
  SUPABASE_SERVICE_ROLE_KEY: string;
  TOKEN_ENCRYPTION_KEY: string; // base64, 32 bytes
  TIKTOK_CLIENT_KEY?: string;
  TIKTOK_CLIENT_SECRET?: string;
  TIKTOK_REDIRECT_URI?: string;
  ANTHROPIC_API_KEY?: string;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Automation {
  id: string;
  handler_key: string;
  name: string;
  description: string | null;
  app_id: string | null;
  cron: string | null;
  enabled: boolean;
  status: 'idle' | 'running' | 'failed' | 'disabled';
  config: Record<string, unknown>;
  next_run_at: string | null;
  last_run_at: string | null;
  failure_streak: number;
}

export interface TikTokAccount {
  id: string;
  handle: string;
  display_name: string | null;
  app_id: string | null;
  open_id: string | null;
  access_token_enc: string | null;
  refresh_token_enc: string | null;
  token_expires_at: string | null;
  status: 'connected' | 'expired' | 'revoked' | 'error';
  daily_post_limit: number;
}

export interface Artifact {
  id: string;
  run_id: string | null;
  app_id: string | null;
  account_id: string | null;
  status: 'draft' | 'approved' | 'publishing' | 'published' | 'rejected' | 'failed';
  hook: string | null;
  caption: string | null;
  hashtags: string[];
  video_url: string | null;
  thumbnail_url: string | null;
  publish_id: string | null;
  scheduled_for: string | null;
}
