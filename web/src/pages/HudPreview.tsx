import CommandCenter, { type CommandCenterPreviewData } from './CommandCenter';
import type { App, Automation } from '../lib/types';

const APPS: App[] = [
  { id: 'deadset', slug: 'deadset', name: 'Deadset', tagline: 'Training intelligence', accent: '#55e8ff', icon: 'activity', sort_order: 1 },
  { id: 'cast', slug: 'cast', name: 'Cast', tagline: 'Social intelligence', accent: '#9c78ff', icon: 'sparkles', sort_order: 2 },
  { id: 'lifescore', slug: 'lifescore', name: 'LifeScore', tagline: 'Personal systems', accent: '#ffb454', icon: 'chart', sort_order: 3 },
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
  automation(0, 'Creative Forge', 'tiktok.generate', 'deadset', 'running', 'sparkles', '#58efff', 'Synthesizing three native performance concepts'),
  automation(1, 'Launch Control', 'tiktok.publish', 'deadset', 'idle', 'send', '#40d8ff', null),
  automation(2, 'Flight Recorder', 'analytics.sync', 'deadset', 'idle', 'chart', '#62f2cf', null),
  automation(3, 'Signal Mapper', 'analytics.sync', 'cast', 'running', 'activity', '#9c78ff', 'Mapping audience velocity across active channels'),
  automation(4, 'Narrative Engine', 'tiktok.generate', 'cast', 'idle', 'file', '#b98aff', null),
  automation(5, 'Vital Monitor', 'system.heartbeat', null, 'idle', 'heart', '#58ffc4', null),
  automation(6, 'Morning Brief', 'report.daily', null, 'idle', 'sun', '#ffcb64', null),
  automation(7, 'Pipeline Sentinel', 'pipeline.audit', null, 'failed', 'shield', '#ff6277', 'Awaiting operator review'),
  automation(8, 'LifeScore Relay', 'tiktok.publish', 'lifescore', 'disabled', 'send', '#ffb454', null),
];

const PREVIEW_DATA: CommandCenterPreviewData = {
  apps: APPS,
  automations: AUTOMATIONS,
  accounts: [
    { id: 'account-a', handle: 'deadset.training', display_name: 'Deadset', app_id: 'deadset', status: 'connected', daily_post_limit: 3, token_expires_at: null },
    { id: 'account-b', handle: 'cast.studio', display_name: 'Cast', app_id: 'cast', status: 'connected', daily_post_limit: 2, token_expires_at: null },
  ],
  queue: [{ status: 'draft' }, { status: 'draft' }, { status: 'approved' }],
  snapshots: [
    { id: 'snapshot-a', account_id: 'account-a', app_id: 'deadset', captured_at: new Date().toISOString(), followers: 12842, following: 114, likes_total: 85200, video_count: 61, views_28d: 412000, watch_time_min: 9280, comments_28d: 1840, shares_28d: 3210, quality: 'ok' },
    { id: 'snapshot-b', account_id: 'account-b', app_id: 'cast', captured_at: new Date().toISOString(), followers: 7218, following: 93, likes_total: 34800, video_count: 37, views_28d: 188000, watch_time_min: 4130, comments_28d: 790, shares_28d: 1260, quality: 'ok' },
  ],
};

/** A safe, synthetic visual-QA surface. Vite removes this route in production. */
export default function HudPreview() {
  return <CommandCenter previewData={PREVIEW_DATA} />;
}
