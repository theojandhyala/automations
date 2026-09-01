import CommandCenter, { type CommandCenterPreviewData } from './CommandCenter';
import type { App, Automation, Run } from '../lib/types';

const APPS: App[] = [
  { id: 'deadset', slug: 'deadset', name: 'Deadset', tagline: 'Plan. Log. Progress.', accent: '#ff513f', icon: 'activity', sort_order: 1, promotion_enabled: true },
  { id: 'cast', slug: 'cast', name: 'Cast', tagline: 'Fish smarter. Catch more.', accent: '#48c9ff', icon: 'sparkles', sort_order: 2, promotion_enabled: true },
  { id: 'lifescore', slug: 'lifescore', name: 'LifeScore', tagline: 'Awaiting release', accent: '#ffc861', icon: 'chart', sort_order: 3, promotion_enabled: false },
];

function automation(
  index: number,
  name: string,
  handlerKey: string,
  appId: string | null,
  status: Automation['status'],
  icon: string,
  accent: string,
  currentTask: string | null,
): Automation {
  return {
    id: `preview-${index}`,
    handler_key: handlerKey,
    name,
    description: `Autonomous ${name.toLowerCase()} protocol with supervised command authority.`,
    app_id: appId,
    cron: index % 3 === 0 ? '0 */6 * * *' : '15 8 * * *',
    enabled: status !== 'disabled',
    status,
    config: {},
    next_run_at: new Date(Date.now() + (index + 1) * 1_800_000).toISOString(),
    last_run_at: new Date(Date.now() - (index + 1) * 950_000).toISOString(),
    running_since: status === 'running' ? new Date(Date.now() - 180_000).toISOString() : null,
    failure_streak: status === 'failed' ? 2 : 0,
    icon,
    accent,
    kind: appId ? 'app' : 'system',
    orbit_ring: index > 4 ? 2 : 1,
    orbit_position: index / 9,
    current_task: currentTask,
  };
}

const AUTOMATIONS: Automation[] = [
  automation(0, 'Deadset Mission Brain', 'tiktok.generate', 'deadset', 'running', 'sparkles', '#ff513f', 'Selecting the next feature proof from recent creative signals'),
  automation(1, 'Cast Mission Brain', 'tiktok.generate', 'cast', 'idle', 'activity', '#48c9ff', null),
  automation(2, 'LifeScore Mission Brain', 'tiktok.generate', 'lifescore', 'disabled', 'shield', '#ffc861', null),
];

const RUNS: Run[] = Array.from({ length: 16 }, (_, index) => {
  const status: Run['status'] = index === 0 ? 'running' : index === 6 ? 'failed' : 'succeeded';
  const started = Date.now() - index * 3_900_000;
  return {
    id: `run-${index}`,
    automation_id: AUTOMATIONS[index % AUTOMATIONS.length]!.id,
    status,
    trigger: index % 4 === 0 ? 'manual' : 'cron',
    started_at: new Date(started).toISOString(),
    finished_at: status === 'running' ? null : new Date(started + 42_000 + index * 1_700).toISOString(),
    duration_ms: status === 'running' ? null : 42_000 + index * 1_700,
    error: status === 'failed' ? 'Proof-source uplink timed out safely before delivery.' : null,
    result: status === 'succeeded' ? { drafted: 3, verified: 3 } : null,
  };
});

const PREVIEW_DATA: CommandCenterPreviewData = {
  apps: APPS,
  automations: AUTOMATIONS,
  runs: RUNS,
  accounts: [
    { id: 'account-a', handle: 'deadset.training', display_name: 'Deadset', app_id: 'deadset', status: 'connected', daily_post_limit: 3, token_expires_at: null },
    { id: 'account-b', handle: 'cast.studio', display_name: 'Cast', app_id: 'cast', status: 'connected', daily_post_limit: 3, token_expires_at: null },
  ],
  queue: [
    { app_id: 'deadset', status: 'draft', created_at: new Date().toISOString() },
    { app_id: 'deadset', status: 'published', created_at: new Date().toISOString() },
    { app_id: 'cast', status: 'approved', created_at: new Date().toISOString() },
  ],
  snapshots: [
    { id: 'snapshot-a', account_id: 'account-a', app_id: 'deadset', captured_at: new Date().toISOString(), followers: 12842, following: 114, likes_total: 85200, video_count: 61, views_28d: 412000, watch_time_min: 9280, comments_28d: 1840, shares_28d: 3210, quality: 'ok' },
    { id: 'snapshot-b', account_id: 'account-b', app_id: 'cast', captured_at: new Date().toISOString(), followers: 7218, following: 93, likes_total: 34800, video_count: 37, views_28d: 188000, watch_time_min: 4130, comments_28d: 790, shares_28d: 1260, quality: 'ok' },
  ],
  readiness: [
    { slug: 'deadset', uploaded_feature_count: 4, feature_count: 6, drafting_ready: true, production_ready: true, publishing_ready: true, blockers: [] },
    { slug: 'cast', uploaded_feature_count: 6, feature_count: 6, drafting_ready: true, production_ready: true, publishing_ready: false, blockers: ['TikTok production review'] },
  ],
  handlers: [
    { key: 'tiktok.generate', name: 'Creative intelligence', description: 'Builds configurable native content concepts from verified product proof.' },
    { key: 'tiktok.produce', name: 'Production foundry', description: 'Produces approved carousel assets through the rendering pipeline.' },
    { key: 'tiktok.publish', name: 'Launch control', description: 'Publishes approved media within configured release and safety limits.' },
    { key: 'tiktok.reconcile', name: 'Delivery reconciler', description: 'Checks in-flight delivery and records final post state.' },
    { key: 'analytics.sync', name: 'Signal mapper', description: 'Collects performance data for linked channels.' },
  ],
};

/** A safe, synthetic visual-QA surface. Vite removes this route in production. */
export default function HudPreview() {
  return <CommandCenter previewData={PREVIEW_DATA} />;
}
