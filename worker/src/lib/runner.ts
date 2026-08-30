import { Db } from './db';
import { nextRun } from './cron';
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
      console.error('failed to flush run_events', err);
    }
  }
}

/**
 * Executes one automation end to end: opens a run row, calls the handler,
 * records the outcome, and schedules the next occurrence. Never throws -- a
 * failing handler is recorded, not propagated, so one bad automation cannot
 * take down the whole dispatch pass.
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
    status: 'running',
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
    error = err instanceof Error ? `${err.message}` : String(err);
    ctx.log('error', 'run failed', { error });
  }

  const durationMs = Date.now() - startedAt;
  await logger.flush();

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

  await db.update('automations', `id=eq.${automation.id}`, {
    status: tripped ? 'disabled' : status === 'failed' ? 'failed' : 'idle',
    enabled: tripped ? false : automation.enabled,
    failure_streak: failureStreak,
    next_run_at: next ? next.toISOString() : null,
  });

  return { runId: run.id, status };
}

/**
 * Cron entrypoint: start every automation whose next_run_at has come due.
 * Runs are started concurrently but each is independently guarded.
 */
export async function dispatchDue(env: Env): Promise<{ started: number }> {
  const db = new Db(env);
  const now = new Date().toISOString();
  const due = await db.select<Automation>(
    'automations',
    `enabled=eq.true&status=neq.running&status=neq.disabled&next_run_at=lte.${now}&order=next_run_at.asc&limit=20`,
  );

  await Promise.all(
    due.map((a) =>
      executeRun(env, a, 'cron').catch((err) => {
        console.error(`dispatch failed for ${a.handler_key}`, err);
      }),
    ),
  );

  return { started: due.length };
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
