import { stageStatuses } from '../lib/pipeline';
import type { Handler } from './registry';

/**
 * Housekeeping agent. Nothing here posts or generates -- it looks for the
 * quiet failure modes the other agents cannot see about themselves: artifacts
 * that stopped moving, tokens about to expire, and stages still unbuilt.
 *
 * config: { stuck_after_hours?: number }
 */
export const pipelineAudit: Handler = {
  key: 'pipeline.audit',
  name: 'Pipeline audit',
  description: 'Flags stuck artifacts, expiring tokens and stages that are still unconfigured.',
  async run(ctx) {
    const config = ctx.automation.config as { stuck_after_hours?: number };
    const stuckHours = Math.min(Math.max(config.stuck_after_hours ?? 48, 1), 720);
    const cutoff = new Date(Date.now() - stuckHours * 60 * 60 * 1000).toISOString();
    const soon = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();

    const [stuck, expiring, breakered] = await Promise.all([
      ctx.db.select<{ id: string; hook: string | null; status: string }>(
        'artifacts',
        `status=in.(draft,approved)&updated_at=lt.${cutoff}&select=id,hook,status&limit=50`,
      ),
      ctx.db.select<{ handle: string; token_expires_at: string | null }>(
        'tiktok_accounts',
        `status=eq.connected&token_expires_at=lt.${soon}&select=handle,token_expires_at`,
      ),
      ctx.db.select<{ name: string; failure_streak: number }>(
        'automations',
        'failure_streak=gt.0&select=name,failure_streak',
      ),
    ]);

    for (const a of stuck) {
      ctx.log('warn', `stuck in ${a.status} for over ${stuckHours}h: ${a.hook ?? a.id}`);
    }
    for (const account of expiring) {
      ctx.log('warn', `@${account.handle} token expires soon`, { at: account.token_expires_at });
    }
    for (const automation of breakered) {
      ctx.log('warn', `${automation.name} has failed ${automation.failure_streak}x in a row`);
    }

    const gaps = stageStatuses(ctx.env).filter((s) => s.state === 'not_built' || s.state === 'not_configured');
    for (const gap of gaps) {
      ctx.log('info', `${gap.name} is ${gap.state}`, { blocker: gap.blocker });
    }

    return {
      stuck_artifacts: stuck.length,
      expiring_tokens: expiring.length,
      failing_automations: breakered.length,
      pipeline_gaps: gaps.length,
    };
  },
};
