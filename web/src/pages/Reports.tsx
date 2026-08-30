import { useState } from 'react';
import { api, supabase } from '../lib/supabase';
import { useData } from '../lib/useData';
import { Ago, Empty } from '../components/bits';
import AnalyticsCards from '../components/AnalyticsCards';
import PipelineRail from '../components/PipelineRail';
import type { Account, AnalyticsSnapshot, App, Automation, DailyReport } from '../lib/types';

const TONE_COLOR: Record<string, string> = {
  ok: 'var(--ok)',
  warn: 'var(--warn)',
  bad: 'var(--bad)',
};

/**
 * The morning report, plus the analytics it summarises. Report delivery is not
 * wired to any channel yet; the page states that rather than leaving the
 * impression a notification went out at 08:00.
 */
export default function Reports() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data, refresh } = useData(async () => {
    const [reports, apps, accounts, snapshots, automations] = await Promise.all([
      supabase.from('daily_reports').select('*').order('for_date', { ascending: false }).limit(14),
      supabase.from('apps').select('*').order('sort_order'),
      supabase.from('tiktok_accounts_public').select('*'),
      supabase.from('analytics_snapshots').select('*')
        .order('captured_at', { ascending: false }).limit(60),
      supabase.from('automations').select('*'),
    ]);
    return {
      reports: (reports.data ?? []) as DailyReport[],
      apps: (apps.data ?? []) as App[],
      accounts: (accounts.data ?? []) as Account[],
      snapshots: (snapshots.data ?? []) as AnalyticsSnapshot[],
      automations: (automations.data ?? []) as Automation[],
    };
  }, [], 15_000);

  async function buildNow() {
    const agent = data?.automations.find((a) => a.handler_key === 'report.daily');
    if (!agent) {
      setError('No morning report agent is set up.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api(`/automations/${agent.id}/run`, { method: 'POST' });
      setTimeout(refresh, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (!data) return <Empty>Loading…</Empty>;

  const [latest, ...older] = data.reports;
  const reportAgent = data.automations.find((a) => a.handler_key === 'report.daily');

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Reports</h2>
          <p>
            The morning report runs at{' '}
            <span className="mono">{reportAgent?.cron ?? '0 8 * * *'}</span> UTC
            {reportAgent && !reportAgent.enabled && ' — currently paused'}.
          </p>
        </div>
        <button onClick={buildNow} disabled={busy}>{busy ? 'Building…' : 'Build one now'}</button>
      </div>

      {error && <div className="card" style={{ color: 'var(--bad)', marginBottom: 14 }}>{error}</div>}

      {!latest ? (
        <div className="card" style={{ marginBottom: 22 }}>
          <Empty>
            No report yet. Enable the Morning report agent, or build one now.
          </Empty>
        </div>
      ) : (
        <div className="card" style={{ marginBottom: 22 }}>
          <div className="row between" style={{ marginBottom: 4 }}>
            <h3 style={{ margin: 0, fontSize: 18 }}>{latest.headline}</h3>
            <span className="muted">{latest.for_date}</span>
          </div>
          <p className="muted" style={{ marginTop: 0 }}>{latest.summary}</p>

          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
            {latest.sections.map((section) => (
              <div key={section.title} style={{
                borderLeft: `2px solid ${TONE_COLOR[section.tone] ?? 'var(--line)'}`,
                paddingLeft: 12,
              }}>
                <strong style={{ fontSize: 13 }}>{section.title}</strong>
                <ul style={{ margin: '6px 0 0', paddingLeft: 16, fontSize: 13 }}>
                  {section.lines.map((line, i) => <li key={i}>{line}</li>)}
                </ul>
              </div>
            ))}
          </div>

          <p style={{
            marginBottom: 0, marginTop: 16, fontSize: 12,
            color: latest.delivery === 'sent' ? 'var(--ok)' : 'var(--warn)',
          }}>
            {latest.delivery === 'unconfigured'
              ? 'Delivery is not configured — this report exists here only, nothing was sent to your phone or inbox.'
              : latest.delivery === 'failed'
                ? `Delivery failed: ${latest.delivery_error ?? 'unknown error'}`
                : `Delivery: ${latest.delivery}`}
          </p>
        </div>
      )}

      <h3 className="section-label">Analytics</h3>
      <div style={{ marginBottom: 22 }}>
        <AnalyticsCards apps={data.apps} accounts={data.accounts} snapshots={data.snapshots} />
      </div>

      <h3 className="section-label">Pipeline</h3>
      <div style={{ marginBottom: 22 }}><PipelineRail /></div>

      {older.length > 0 && (
        <>
          <h3 className="section-label">Earlier reports</h3>
          <div className="card" style={{ padding: 0 }}>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Date</th><th>Headline</th><th>Published</th><th>Generated</th></tr></thead>
                <tbody>
                  {older.map((r) => (
                    <tr key={r.id}>
                      <td className="mono">{r.for_date}</td>
                      <td>{r.headline}</td>
                      <td>{r.metrics['published'] ?? 0}</td>
                      <td><Ago at={r.generated_at} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}
