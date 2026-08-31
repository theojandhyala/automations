import { Db } from './db';
import { nextRun } from './cron';
import { log, errorFields } from './log';
import type { Automation, Env, LogLevel } from '../types';
import { getHandler } from '../automations/registry';

/** After this many consecutive failures the dispatcher stops picking it up. */
const FAILURE_BREAKER = 5;

export interface RunContext {
  env: Env;
  db: Db;
  automation: Automation;
  runId: string;
  log(level: LogLevel, message: string, data?: unknown): void;
  /** Sets the one-line "what am I doing right now" shown on the agent badge. */
  setTask(task: string): Promise<void>;
}

/**
 * Buffers log lines and flushes them in one insert at the end of the run, so a
 * chatty handler costs one round trip rather than one per line.
 */
class RunLogger {
  private buffer: Array<{ run_id: string; level: LogLevel; message: string; data: unknown; at: string }> = [];

  constructor(private db: Db, private runId: string) {}

  log(level: LogLevel, message: string, data?: unknown): void {
    this.buffer.push({
      run_id: this.runId,
      level,
      message,
      data: data === undefined ? null : data,
      at: new Date().toISOString(),
    });
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    const rows = this.buffer;
    this.buffer = [];
    try {
      await this.db.insertMany('run_events', rows);
    } catch (err) {
      // Losing logs must never fail an otherwise good run.
      log.error('failed to flush run_events', { run_id: this.runId, ...errorFields(err) });
    }
  }
}

/**
 * Atomically claims automations that are due. The claim flips each row to
 * 'running' in the same statement that selects it, so two overlapping
 * dispatchers partition the due set rather than both running the same
 * automation. Only claimed rows come back.
 */
export function claimDue(env: Env, limit = 20): Promise<Automation[]> {
  return new Db(env).rpc<Automation[]>('claim_due_automations', { p_limit: limit });
}

/**
 * Claims one automation for a manual run. Returns null when it is already
 * running, which the API turns into a 409 instead of a second concurrent run.
 */
export async function claimOne(env: Env, id: string): Promise<Automation | null> {
  const rows = await new Db(env).rpc<Automation[]>('claim_automation', { p_id: id });
  return rows[0] ?? null;
}

/**
 * Executes one already-claimed automation: opens a run row, calls the handler,
 * records the outcome, and schedules the next occurrence. Never throws -- a
 * failing handler is recorded, not propagated, so one bad automation cannot
 * take down the whole dispatch pass.
 *
 * The caller must have claimed the automation first (claimDue / claimOne);
 * this function assumes the row is already marked 'running' and is responsible
 * for releasing it.
 */
export async function executeRun(
  env: Env,
  automation: Automation,
  trigger: 'cron' | 'manual' | 'chain',
): Promise<{ runId: string; status: 'succeeded' | 'failed' }> {
  const db = new Db(env);
  const startedAt = Date.now();

  const run = await db.insert<{ id: string }>('runs', {
    automation_id: automation.id,
    status: 'running',
    trigger,
  });

  await db.update('automations', `id=eq.${automation.id}`, {
    last_run_at: new Date().toISOString(),
    last_run_id: run.id,
  });

  const logger = new RunLogger(db, run.id);
  const ctx: RunContext = {
    env,
    db,
    automation,
    runId: run.id,
    log: (level, message, data) => logger.log(level, message, data),
    setTask: async (task) => {
      logger.log('info', task);
      await db.update('automations', `id=eq.${automation.id}`, { current_task: task });
    },
  };

  let status: 'succeeded' | 'failed' = 'succeeded';
  let error: string | null = null;
  let result: unknown = null;

  try {
    const handler = getHandler(automation.handler_key);
    if (!handler) throw new Error(`no handler registered for "${automation.handler_key}"`);
    ctx.log('info', `starting ${automation.handler_key}`);
    result = (await handler.run(ctx)) ?? null;
    ctx.log('info', 'finished');
  } catch (err) {
    status = 'failed';
    error = err instanceof Error ? err.message : String(err);
    ctx.log('error', 'run failed', { error });
  }

  const durationMs = Date.now() - startedAt;
  await logger.flush();

  log[status === 'failed' ? 'error' : 'info']('run finished', {
    run_id: run.id,
    automation: automation.handler_key,
    automation_id: automation.id,
    trigger,
    status,
    duration_ms: durationMs,
    ...(error ? { error } : {}),
  });

  await db.update('runs', `id=eq.${run.id}`, {
    status,
    error,
    result,
    finished_at: new Date().toISOString(),
    duration_ms: durationMs,
  });

  const failureStreak = status === 'failed' ? automation.failure_streak + 1 : 0;
  const tripped = failureStreak >= FAILURE_BREAKER;
  const next = automation.cron && automation.enabled && !tripped
    ? nextRun(automation.cron)
    : null;

  // Releases the claim: running_since goes back to null and the status leaves
  // 'running', which is what makes the row eligible for the next claim.
  await db.update('automations', `id=eq.${automation.id}`, {
    status: tripped ? 'disabled' : status === 'failed' ? 'failed' : 'idle',
    enabled: tripped ? false : automation.enabled,
    failure_streak: failureStreak,
    running_since: null,
    current_task: null,
    next_run_at: next ? next.toISOString() : null,
  });

  return { runId: run.id, status };
}

/**
 * Cron entrypoint: claim everything due and run it. Ordinary runs proceed
 * concurrently; media producers serialize so they can reuse one browser.
 */
export async function dispatchDue(env: Env): Promise<{ started: number }> {
  const claimed = await claimDue(env);
  if (claimed.length === 0) return { started: 0 };

  const runClaimed = (automation: Automation) =>
    executeRun(env, automation, 'cron').catch((err) => {
      log.error('dispatch failed', { automation: automation.handler_key, ...errorFields(err) });
      // The claim would otherwise stay held until it went stale.
      return new Db(env)
        .update('automations', `id=eq.${automation.id}`, {
          status: 'failed',
          running_since: null,
          current_task: null,
        })
        .catch(() => undefined);
    });

  const producers = claimed.filter((automation) => automation.handler_key === 'tiktok.produce');
  const other = claimed.filter((automation) => automation.handler_key !== 'tiktok.produce');
  await Promise.all(other.map(runClaimed));
  // Browser Run's free plan starts at most one new browser every 20 seconds.
  // Production runs are serialized so Cast can reuse Deadset's idle session
  // (or vice versa) rather than racing to launch another browser.
  for (const producer of producers) await runClaimed(producer);

  return { started: claimed.length };
}

/**
 * Any automation that is enabled and cron-scheduled but has no next_run_at
 * (freshly created, or just re-enabled) gets one scheduled.
 */
export async function backfillSchedules(env: Env): Promise<void> {
  const db = new Db(env);
  const pending = await db.select<Automation>(
    'automations',
    'enabled=eq.true&next_run_at=is.null&cron=not.is.null&limit=50',
  );
  for (const a of pending) {
    if (!a.cron) continue;
    const next = nextRun(a.cron);
    if (next) {
      await db.update('automations', `id=eq.${a.id}`, { next_run_at: next.toISOString() });
    }
  }
}
