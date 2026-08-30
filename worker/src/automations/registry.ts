import type { RunContext } from '../lib/runner';
import { heartbeat } from './heartbeat';
import { generateDrafts } from './tiktok-generate';
import { publishApproved } from './tiktok-publish';
import { reconcilePublishing } from './tiktok-reconcile';
import { analyticsSync } from './analytics-sync';
import { reportDaily } from './report-daily';
import { pipelineAudit } from './pipeline-audit';
import { produceCarousels } from './tiktok-produce';

export interface Handler {
  key: string;
  name: string;
  description: string;
  /** Returns a small JSON summary stored on the run row. */
  run(ctx: RunContext): Promise<unknown>;
}

const HANDLERS: Handler[] = [
  heartbeat,
  generateDrafts,
  produceCarousels,
  publishApproved,
  reconcilePublishing,
  analyticsSync,
  reportDaily,
  pipelineAudit,
];

const BY_KEY = new Map(HANDLERS.map((h) => [h.key, h]));

export function getHandler(key: string): Handler | undefined {
  return BY_KEY.get(key);
}

/** Every handler the dashboard can offer when creating an automation. */
export function listHandlers(): Array<Omit<Handler, 'run'>> {
  return HANDLERS.map(({ key, name, description }) => ({ key, name, description }));
}
