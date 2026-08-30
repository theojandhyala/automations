import { stageStatuses } from '../lib/pipeline';
import type { Handler } from './registry';

interface CountRow { id: string }

/**
 * Builds the morning report: what ran overnight, what shipped, what is waiting
 * on a decision, and what is broken.
 *
 * Delivery is deliberately a separate concern. The report is written to the
 * database and readable in the dashboard immediately; `delivery` stays
 * 'unconfigured' until a push/email channel is actually wired, so the UI never
 * implies a notification was sent when none was.
 */
export const reportDaily: Handler = {
  key: 'report.daily',
  name: 'Morning report',
  description: 'Builds the 08:00 report: what ran, what shipped, what needs a decision.',
  async run(ctx) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const today = new Date().toISOString().slice(0, 10);

    const [runs, published, awaiting, failedArtifacts, accounts, snapshots] = await Promise.all([
      ctx.db.select<{ id: string; status: string; automation_id: string }>(
        'runs',
        `started_at=gte.${since}&select=id,status,automation_id`,
      ),
      ctx.db.select<CountRow>('artifacts', `status=eq.published&published_at=gte.${since}&select=id`),
      ctx.db.select<CountRow>('artifacts', 'status=eq.draft&select=id'),
      ctx.db.select<{ id: string; error: string | null }>(
        'artifacts',
        'status=eq.failed&select=id,error&limit=10',
      ),
      ctx.db.select<{ id: string; handle: string; status: string }>(
        'tiktok_accounts',
        'select=id,handle,status',
      ),
      ctx.db.select<{ followers: number | null; captured_at: string; account_id: string }>(
        'analytics_snapshots',
        `captured_at=gte.${since}&select=followers,captured_at,account_id&order=captured_at.desc`,
      ),
    ]);

    const failedRuns = runs.filter((r) => r.status === 'failed');
    const unhealthyAccounts = accounts.filter((a) => a.status !== 'connected');
    const unbuilt = stageStatuses(ctx.env).filter((s) => s.state !== 'ready' && s.state !== 'manual');

    const sections: Array<{ title: string; lines: string[]; tone: 'ok' | 'warn' | 'bad' }> = [
      {
        title: 'Overnight',
        tone: failedRuns.length > 0 ? 'warn' : 'ok',
        lines: [
          `${runs.length} run${runs.length === 1 ? '' : 's'}, ${failedRuns.length} failed`,
          `${published.length} video${published.length === 1 ? '' : 's'} published`,
        ],
      },
      {
        title: 'Needs you',
        tone: awaiting.length > 0 ? 'warn' : 'ok',
        lines: awaiting.length
          ? [`${awaiting.length} draft${awaiting.length === 1 ? '' : 's'} waiting for review`]
          : ['Nothing waiting for review'],
      },
    ];

    if (failedArtifacts.length > 0) {
      sections.push({
        title: 'Failed videos',
        tone: 'bad',
        lines: failedArtifacts.map((a) => a.error ?? 'unknown error').slice(0, 5),
      });
    }

    if (unhealthyAccounts.length > 0) {
      sections.push({
        title: 'Accounts',
        tone: 'bad',
        lines: unhealthyAccounts.map((a) => `@${a.handle} is ${a.status} — reconnect it`),
      });
    }

    if (snapshots.length === 0) {
      sections.push({
        title: 'Analytics',
        tone: 'warn',
        lines: ['No snapshot in the last 24h — enable Analytics sync, or check its scopes'],
      });
    }

    if (unbuilt.length > 0) {
      sections.push({
        title: 'Pipeline gaps',
        tone: 'warn',
        lines: unbuilt.map((s) => `${s.name}: ${s.blocker}`),
      });
    }

    const headline = failedRuns.length > 0 || unhealthyAccounts.length > 0
      ? 'Needs attention'
      : awaiting.length > 0
        ? `${awaiting.length} draft${awaiting.length === 1 ? '' : 's'} to review`
        : 'All clear';

    // One report per day; a re-run replaces it rather than stacking duplicates.
    const existing = await ctx.db.selectOne<CountRow>('daily_reports', `for_date=eq.${today}&select=id`);
    const payload = {
      for_date: today,
      run_id: ctx.runId,
      generated_at: new Date().toISOString(),
      headline,
      summary: `${runs.length} runs, ${published.length} published, ${awaiting.length} awaiting review.`,
      sections,
      metrics: {
        runs: runs.length,
        failed_runs: failedRuns.length,
        published: published.length,
        awaiting_review: awaiting.length,
        accounts_connected: accounts.filter((a) => a.status === 'connected').length,
      },
      // No delivery channel is wired yet -- see README.
      delivery: 'unconfigured',
    };

    if (existing) {
      await ctx.db.update('daily_reports', `id=eq.${existing.id}`, payload);
    } else {
      await ctx.db.insert('daily_reports', payload);
    }

    ctx.log('info', `report ready: ${headline}`, payload.metrics);
    return { headline, ...payload.metrics, delivery: 'unconfigured' };
  },
};
