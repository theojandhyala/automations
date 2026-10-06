import { ensureTikTokReadiness } from './tiktok-readiness';
import { brandStudio } from './tiktok-brand-studio';
import { cloudWorkGate } from '../lib/cloud-studio';
import type { RunContext } from '../lib/runner';
import { generateDrafts } from './tiktok-generate';
import { publishApproved } from './tiktok-publish';
import { reconcilePublishing } from './tiktok-reconcile';
import { analyticsSync } from './analytics-sync';
import { produceCarousels } from './tiktok-produce';

export interface Handler {
  key: string;
  name: string;
  description: string;
  /** Returns a small JSON summary stored on the run row. */
  run(ctx: RunContext): Promise<unknown>;
}

const HANDLERS: Handler[] = [
  brandStudio,
  ensureTikTokReadiness,
  generateDrafts,
  produceCarousels,
  publishApproved,
  reconcilePublishing,
  analyticsSync,
];

/** The only executable work is the posting pipeline for the three app missions. */
export const POSTING_HANDLER_KEYS = new Set(HANDLERS.map((handler) => handler.key));

const BY_KEY = new Map(HANDLERS.map((h) => [h.key, {
  ...h,
  async run(ctx: RunContext) {
    const hold = await cloudWorkGate(ctx);
    if (hold) { ctx.log('warn', 'cloud preparation held', { reason: hold }); return { held: true, reason: hold }; }
    return h.run(ctx);
  },
}]));

export function getHandler(key: string): Handler | undefined {
  return BY_KEY.get(key);
}

/** Every handler the dashboard can offer when creating an automation. */
export function listHandlers(): Array<Omit<Handler, 'run'>> {
  return HANDLERS.map(({ key, name, description }) => ({ key, name, description }));
}
