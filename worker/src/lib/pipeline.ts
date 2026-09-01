import type { Env } from '../types';
import { publishProvider, unattendedPublishingEnabled } from './tiktok';

/**
 * The real production pipeline. Every automated stage points at the handler
 * that actually advances it; owner review and scheduling remain manual.
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
    description: 'Analyse recent hooks, feature coverage and real post metrics before choosing the next test.',
    handler: 'tiktok.generate',
    requires: [],
  },
  {
    key: 'concept',
    name: 'Concept',
    description: 'Draft truth-locked hooks, captions, shot notes and carousel manifests, with a verified fallback brain.',
    handler: 'tiktok.generate',
    requires: [],
  },
  {
    key: 'script',
    name: 'Script',
    description: 'Expand a concept into a shot-by-shot script with timings.',
    handler: 'tiktok.generate',
    requires: [],
  },
  {
    key: 'assets',
    name: 'Assets / footage',
    description: 'Gather licensed real photos and exact current app captures.',
    handler: 'tiktok.produce',
    requires: [],
  },
  {
    key: 'edit',
    name: 'Edit / render',
    description: 'Render native 1080×1920 JPEG slides in a bounded paid Browser Run session.',
    handler: 'tiktok.produce',
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
    description: 'Feed post performance back into the next creative decision without producing a separate report.',
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
    const unattended = unattendedPublishingEnabled(env);
    const resolved = unattended && stage.key === 'review'
      ? { ...stage, handler: 'tiktok.produce', manual: false, description: 'Apply deterministic truth, media and native-quality gates before scheduling.' }
      : unattended && stage.key === 'schedule'
        ? { ...stage, handler: 'tiktok.publish', manual: false, description: 'Release one approved carousel per account at 12:00, 15:00 and 18:00 Europe/London.' }
        : stage;
    const isTikTokApiStage = resolved.key === 'publish' || resolved.key === 'analytics';
    const required = isTikTokApiStage && publishProvider(env) === 'business_accounts'
      ? [
          'TIKTOK_BUSINESS_CLIENT_ID',
          'TIKTOK_BUSINESS_CLIENT_SECRET',
          'TIKTOK_BUSINESS_AUTH_URL',
          'TIKTOK_BUSINESS_REDIRECT_URI',
        ] as Array<keyof Env>
      : resolved.requires;
    const missing = required.filter((key) => !env[key]);

    let state: StageState;
    let blocker: string | null = null;

    if (!resolved.handler && !resolved.manual) {
      state = 'not_built';
      blocker = 'No handler implemented yet — this stage does nothing.';
    } else if (missing.length > 0) {
      state = 'not_configured';
      blocker = `Missing ${missing.join(', ')}`;
    } else if (resolved.manual) {
      state = 'manual';
    } else {
      state = 'ready';
    }

    return { ...resolved, requires: required, state, blocker };
  });
}
