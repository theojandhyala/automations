export interface App {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  accent: string;
  icon: string;
  sort_order: number;
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
  running_since: string | null;
  failure_streak: number;
  icon: string;
  accent: string | null;
  kind: 'app' | 'system';
  orbit_ring: number;
  orbit_position: number | null;
  current_task: string | null;
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
  stage: string;
  stages: Record<string, { state: string; at?: string; note?: string }>;
  shot_notes: string | null;
  script: string | null;
  tiktok_post_id: string | null;
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

export interface AnalyticsSnapshot {
  id: string;
  account_id: string;
  app_id: string | null;
  captured_at: string;
  followers: number | null;
  following: number | null;
  likes_total: number | null;
  video_count: number | null;
  views_28d: number | null;
  watch_time_min: number | null;
  comments_28d: number | null;
  shares_28d: number | null;
  quality: 'ok' | 'partial' | 'unavailable';
}

export interface ReportSection {
  title: string;
  lines: string[];
  tone: 'ok' | 'warn' | 'bad';
}

export interface DailyReport {
  id: string;
  for_date: string;
  generated_at: string;
  headline: string | null;
  summary: string | null;
  sections: ReportSection[];
  metrics: Record<string, number>;
  delivery: 'unconfigured' | 'pending' | 'sent' | 'failed';
  delivery_error: string | null;
}
