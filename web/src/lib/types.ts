export interface App {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
}

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

export interface Run {
  id: string;
  automation_id: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  trigger: 'cron' | 'manual' | 'chain';
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  error: string | null;
  result: Record<string, unknown> | null;
}

export interface RunEvent {
  id: number;
  run_id: string;
  at: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  data: unknown;
}

export interface Artifact {
  id: string;
  app_id: string | null;
  account_id: string | null;
  status: 'draft' | 'approved' | 'publishing' | 'published' | 'rejected' | 'failed';
  hook: string | null;
  caption: string | null;
  hashtags: string[];
  video_url: string | null;
  error: string | null;
  scheduled_for: string | null;
  published_at: string | null;
  created_at: string;
}

export interface Account {
  id: string;
  handle: string;
  display_name: string | null;
  app_id: string | null;
  status: 'connected' | 'expired' | 'revoked' | 'error';
  daily_post_limit: number;
  token_expires_at: string | null;
}
