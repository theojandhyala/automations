import type { DeadsetBaseline } from "./deadset-baseline";
import type { HqApp, HqDay, StoredDay, AppleSettings } from "./hq-metrics";
export interface HqPayload {
  billing: BillingSnapshot | null;
  billing_charts: BillingCharts | null;
  billing_configured: boolean;
  billing_status: { at: string; status: string; error: string | null } | null;
  product: ProductSnapshot | null;
  product_configured: boolean;
  product_status: { at: string; status: string; error: string | null } | null;
  app: HqApp;
  refreshed_at: string;
  days: HqDay[];
  records: StoredDay[];
  baseline: DeadsetBaseline | null;
  baseline_history: DeadsetBaseline[];
  apple_configured: boolean;
  apple_settings: AppleSettings | null;
  apple_sync: { saved: number; errors: string[]; at: string } | null;
  channels: Array<{ id: string; handle: string; status: string }>;
  snapshots: Array<{
    account_id: string;
    captured_at: string;
    followers: number | null;
    quality: string;
  }>;
  posts: Array<{
    id: string;
    hook: string | null;
    status: string;
    published_at: string | null;
    created_at: string;
    tiktok_post_id: string | null;
  }>;
  post_metrics: Array<{
    account_id: string;
    tiktok_post_id: string;
    artifact_id: string | null;
    captured_at: string;
    views: number | null;
    likes: number | null;
    comments: number | null;
    shares: number | null;
  }>;
  automations: Array<{
    id: string;
    name: string;
    enabled: boolean;
    status: string;
    failure_streak: number;
  }>;
  errors: string[];
}

export interface ProductSnapshot {
  captured_at: string;
  app: HqApp;
  registered_users: number;
  actions_total: number;
  sessions_total: number;
  first_action_users: number;
  second_action_users: number;
  activity_users_24h: number;
  activity_users_7d: number;
  days: HqDay[];
  baseline?: DeadsetBaseline;
  excluded_records: number;
  definition: string;
}

export interface BillingSnapshot {
  app: HqApp;
  captured_at: string;
  project_id: string;
  currency: "GBP";
  days: HqDay[];
  metrics: Array<{
    id: string;
    name: string;
    description: string;
    unit: string;
    period: string;
    value: number;
    last_updated_at?: number | null;
  }>;
}

export interface BillingCharts {
  captured_at: string;
  errors: Record<string, string>;
  charts: Array<{
    id: string;
    title: string;
    description: string;
    captured_at: string;
    series: Array<{
      label: string;
      description: string;
      unit: string;
      current: number | null;
      points: Array<{ date: string; value: number | null }>;
    }>;
  }>;
}
