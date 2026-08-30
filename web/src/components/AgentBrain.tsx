import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, supabase } from '../lib/supabase';
import { useData } from '../lib/useData';
import { Ago, Duration } from './bits';
import { AgentIcon } from './icons';
import type { App, Artifact, Automation, Run, RunEvent } from '../lib/types';

/**
 * An agent's "brain": what it is doing now, when it last and next runs, its
 * schedule and config, recent logs, what it produced, and its health. This is
 * what clicking a hex badge opens.
 */
export default function AgentBrain({
  automation,
  apps,
  onClose,
  onChanged,
}: {
  automation: Automation;
  apps: App[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configDraft, setConfigDraft] = useState<string | null>(null);

  // Escape closes the drawer, as a drawer should.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const { data } = useData(async () => {
    const [runs, outputs] = await Promise.all([
      supabase.from('runs').select('*').eq('automation_id', automation.id)
        .order('started_at', { ascending: false }).limit(12),
      supabase.from('artifacts').select('*')
        .eq('app_id', automation.app_id ?? '00000000-0000-0000-0000-000000000000')
        .order('created_at', { ascending: false }).limit(5),
    ]);
    const latest = (runs.data as Run[] | null)?.[0];
    const events = latest
      ? await supabase.from('run_events').select('*').eq('run_id', latest.id).order('id').limit(60)
      : { data: [] };
    return {
      runs: (runs.data ?? []) as Run[],
      outputs: (outputs.data ?? []) as Artifact[],
      events: (events.data ?? []) as RunEvent[],
    };
  }, [automation.id], 4000);

  const app = apps.find((p) => p.id === automation.app_id);
  const accent = automation.accent ?? app?.accent ?? '#6ea8fe';

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const saveConfig = () =>
    act(async () => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(configDraft ?? '{}');
      } catch {
        throw new Error('Config must be valid JSON');
      }
      await api(`/automations/${automation.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ config: parsed }),
      });
      setConfigDraft(null);
    });

  const runs = data?.runs ?? [];
  const succeeded = runs.filter((r) => r.status === 'succeeded').length;

  return (
    <>
      <div className="brain-scrim" onClick={onClose} />
      <aside className="brain" role="dialog" aria-modal="true" aria-label={`${automation.name} details`}>
        <header className="brain-head">
          <div className="row between">
            <h3>
              <span style={{ color: accent, display: 'inline-flex' }}>
                <AgentIcon name={automation.icon} size={22} />
              </span>
              {automation.name}
            </h3>
            <button onClick={onClose} aria-label="Close">✕</button>
          </div>
          <div className="row" style={{ marginTop: 8, flexWrap: 'wrap' }}>
            <span className="pill" style={{ color: accent, borderColor: accent }}>
              {app ? app.name : 'System'}
            </span>
            <span className="pill">{automation.status}</span>
            <span className="mono muted" style={{ fontSize: 11 }}>{automation.handler_key}</span>
          </div>
        </header>

        <div className="brain-body">
          {error && <div className="brain-section" style={{ color: 'var(--bad)' }}>{error}</div>}

          <div className="row">
            <button
              className="primary"
              disabled={busy || automation.status === 'running'}
              onClick={() => act(() => api(`/automations/${automation.id}/run`, { method: 'POST' }))}
            >
              Run now
            </button>
            <button
              disabled={busy}
              onClick={() =>
                act(() =>
                  api(`/automations/${automation.id}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ enabled: !automation.enabled }),
                  }),
                )
              }
            >
              {automation.enabled ? 'Pause' : 'Enable'}
            </button>
            <Link to={`/automations/${automation.id}`} onClick={onClose}>
              <button>Full history</button>
            </Link>
          </div>

          <section className="brain-section">
            <h4>Current task</h4>
            {automation.status === 'running' ? (
              <p style={{ margin: 0, color: 'var(--state-working, #34d399)' }}>
                {automation.current_task ?? 'Working…'}
              </p>
            ) : (
              <p style={{ margin: 0 }} className="muted">
                Not running. {automation.enabled ? 'Waiting for its next slot.' : 'Paused.'}
              </p>
            )}
          </section>

          <section className="brain-section">
            <h4>Schedule</h4>
            <dl className="kv">
              <dt>Cron (UTC)</dt>
              <dd className="mono">{automation.cron ?? 'manual only'}</dd>
              <dt>Last run</dt>
              <dd><Ago at={automation.last_run_at} /></dd>
              <dt>Next run</dt>
              <dd>{automation.enabled ? <Ago at={automation.next_run_at} /> : 'paused'}</dd>
            </dl>
          </section>

          <section className="brain-section">
            <h4>Health</h4>
            <dl className="kv">
              <dt>Recent runs</dt>
              <dd>{succeeded}/{runs.length} succeeded</dd>
              <dt>Failure streak</dt>
              <dd style={{ color: automation.failure_streak ? 'var(--bad)' : undefined }}>
                {automation.failure_streak}
                {automation.failure_streak >= 5 && ' — breaker tripped'}
              </dd>
            </dl>
            {/* Oldest run on the left, newest on the right. */}
            <div className="health-bar" aria-label="Recent run outcomes">
              {[...runs].reverse().map((r) => (
                <i key={r.id} data-r={r.status} title={`${r.status} — ${r.started_at}`} />
              ))}
            </div>
          </section>

          <section className="brain-section">
            <h4>Configuration</h4>
            <textarea
              className="mono"
              value={configDraft ?? JSON.stringify(automation.config, null, 2)}
              onChange={(e) => setConfigDraft(e.target.value)}
            />
            {configDraft !== null && (
              <div className="row" style={{ marginTop: 8 }}>
                <button className="primary" disabled={busy} onClick={saveConfig}>Save</button>
                <button onClick={() => setConfigDraft(null)}>Cancel</button>
              </div>
            )}
          </section>

          <section className="brain-section">
            <h4>Recent logs</h4>
            <div className="logs mono" style={{ maxHeight: 220 }}>
              {(data?.events ?? []).map((e) => (
                <div key={e.id} className={`line ${e.level}`}>
                  <span className="ts">{new Date(e.at).toISOString().slice(11, 19)}</span>
                  <span>{e.message}</span>
                </div>
              ))}
              {(data?.events ?? []).length === 0 && (
                <span className="muted">No log lines yet.</span>
              )}
            </div>
          </section>

          {automation.app_id && (
            <section className="brain-section">
              <h4>Recent outputs</h4>
              {(data?.outputs ?? []).length === 0 ? (
                <p className="muted" style={{ margin: 0 }}>Nothing produced yet.</p>
              ) : (
                <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
                  {data!.outputs.map((o) => (
                    <li key={o.id}>
                      <span>{o.hook ?? 'Untitled'}</span>{' '}
                      <span className="pill">{o.status}</span>
                    </li>
                  ))}
                </ul>
              )}
              <Link to="/queue" onClick={onClose} style={{ fontSize: 12 }}>Open the review queue →</Link>
            </section>
          )}

          <section className="brain-section">
            <h4>Run history</h4>
            <div className="table-wrap">
              <table>
                <tbody>
                  {runs.map((r) => (
                    <tr key={r.id}>
                      <td><span className={`dot ${r.status}`} /> <Ago at={r.started_at} /></td>
                      <td className="muted">{r.trigger}</td>
                      <td><Duration ms={r.duration_ms} /></td>
                    </tr>
                  ))}
                  {runs.length === 0 && (
                    <tr><td className="muted">No runs yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </aside>
    </>
  );
}
