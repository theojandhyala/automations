import type { Env } from '../types';

/**
 * The real production pipeline. Most of it is not wired yet, and the dashboard
 * says so: a stage whose requirements are not met reports 'not_configured'
 * rather than rendering as though it works. Keeping this list honest is the
 * point -- tiktok.generate writes concepts and asset manifests, but it does
 * not download, license, render or host the final media.
 */
export type StageKey =
  | 'research' | 'concept' | 'script' | 'assets'
  | 'edit' | 'review' | 'schedule' | 'publish' | 'analytics';

export interface StageDef {
  key: StageKey;
  name: string;
  description: string;
  /** The handler that advances this stage, when one exists. */
  handler: string | null;
  /** Env/setup this stage needs before it can do anything. */
  requires: Array<keyof Env>;
  /** True when a human does this step rather than an automation. */
  manual?: boolean;
}

export const STAGES: StageDef[] = [
  {
    key: 'research',
    name: 'Research',
    description: 'Find angles worth making: trends, comments, competitor hooks.',
    handler: null,
    requires: [],
  },
  {
    key: 'concept',
    name: 'Concept',
    description: 'Draft hooks, captions, shot notes and carousel manifests.',
    handler: 'tiktok.generate',
    requires: ['AI'],
  },
  {
    key: 'script',
    name: 'Script',
    description: 'Expand a concept into a shot-by-shot script with timings.',
    handler: null,
    requires: [],
  },
  {
    key: 'assets',
    name: 'Assets / footage',
    description: 'Gather licensed real photos and exact current app captures.',
    handler: null,
    requires: [],
  },
  {
    key: 'edit',
    name: 'Edit / render',
    description: 'Cut the video, burn in captions, export a vertical master.',
    handler: null,
    requires: [],
  },
  {
    key: 'review',
    name: 'Review',
    description: 'Preview exact media, choose TikTok settings and explicitly approve.',
    handler: null,
    requires: [],
    manual: true,
  },
  {
    key: 'schedule',
    name: 'Schedule',
    description: 'Place the approved video in a posting slot.',
    handler: null,
    requires: [],
    manual: true,
  },
  {
    key: 'publish',
    name: 'Publish',
    description: 'Send an approved video or photo carousel to TikTok and confirm it landed.',
    handler: 'tiktok.publish',
    requires: ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET'],
  },
  {
    key: 'analytics',
    name: 'Analytics',
    description: 'Pull views, watch time and follower deltas back in.',
    handler: 'analytics.sync',
    requires: ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET'],
  },
];

export type StageState = 'ready' | 'manual' | 'not_configured' | 'not_built';

export interface StageStatus extends StageDef {
  state: StageState;
  /** Why it is not ready, when it is not. */
  blocker: string | null;
}

/**
 * Resolves each stage against the current environment. 'not_built' means no
 * handler exists yet; 'not_configured' means a handler exists but its
 * credentials are missing.
 */
export function stageStatuses(env: Env): StageStatus[] {
  return STAGES.map((stage) => {
    const missing = stage.requires.filter((key) => !env[key]);

    let state: StageState;
    let blocker: string | null = null;

    if (!stage.handler && !stage.manual) {
      state = 'not_built';
      blocker = 'No handler implemented yet — this stage does nothing.';
    } else if (missing.length > 0) {
      state = 'not_configured';
      blocker = `Missing ${missing.join(', ')}`;
    } else if (stage.manual) {
      state = 'manual';
    } else {
      state = 'ready';
    }

    return { ...stage, state, blocker };
  });
}
