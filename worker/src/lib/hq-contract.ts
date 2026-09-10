import type { DeadsetBaseline } from "./deadset-baseline";
import type { HqApp, HqDay, StoredDay, AppleSettings } from "./hq-metrics";
export interface HqPayload {
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
