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
  onEdit,
  onClone,
}: {
  automation: Automation;
  apps: App[];
  onClose: () => void;
  onChanged: () => void;
  onEdit: () => void;
  onClone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runArmed, setRunArmed] = useState(false);

  // Escape closes the drawer, as a drawer should.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (!runArmed) return undefined;
    const timeout = window.setTimeout(() => setRunArmed(false), 10_000);
    return () => window.clearTimeout(timeout);
  }, [runArmed]);

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
  const releaseLocked = app?.promotion_enabled === false;

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

  function runNow() {
    if (automation.handler_key === 'tiktok.publish' && !runArmed) {
      setRunArmed(true);
      return;
    }
    setRunArmed(false);
    void act(() => api(`/automations/${automation.id}/run`, { method: 'POST' }));
  }

  const runs = data?.runs ?? [];
  const succeeded = runs.filter((r) => r.status === 'succeeded').length;
  const featureRotation = Array.isArray(automation.config.feature_rotation)
    ? automation.config.feature_rotation.map(String)
    : [];

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
              {app?.name ?? 'App'} mission
            </h3>
            <button onClick={onClose} aria-label="Close">✕</button>
          </div>
          <div className="row" style={{ marginTop: 8, flexWrap: 'wrap' }}>
            <span className="pill" style={{ color: accent, borderColor: accent }}>
              {app ? app.name : 'System'}
            </span>
            <span className="pill">{automation.status}</span>
            <span className="pill">POSTING INTELLIGENCE</span>
          </div>
        </header>

        <div className="brain-body">
          {error && <div className="brain-section" style={{ color: 'var(--bad)' }}>{error}</div>}

          <div className="row agent-authority-actions">
            <button
              className={`primary ${runArmed ? 'armed' : ''}`}
              disabled={busy || automation.status === 'running' || releaseLocked}
              onClick={runNow}
            >
              {runArmed ? 'Confirm external launch' : 'Run now'}
            </button>
            <button
              disabled={busy || releaseLocked}
              onClick={() =>
                act(() =>
                  api(`/automations/${automation.id}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ enabled: !automation.enabled }),
                  }),
                )
              }
            >
              {releaseLocked ? 'Release locked' : automation.enabled ? 'Pause' : 'Enable'}
            </button>
            <button disabled={busy} onClick={onEdit}>Recalibrate</button>
            <button disabled={busy} onClick={onClone}>Clone</button>
          </div>
          {runArmed ? <div className="brain-authority-warning" role="status">Publishing leaves the system. Confirm within 10 seconds to launch this protocol with owner authority.</div> : null}

          <section className="brain-section agent-mission">
            <h4>JARVIS mission file</h4>
            <p>Create native TikTok posts for {app?.name ?? 'this app'} using real licensed imagery, exact product proof, performance learning and automated truth and quality gates.</p>
            <span className="mono">Try: “JARVIS, draft 3 {app?.name ?? 'app'} carousels”</span>
          </section>

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
            <h4>Intelligence profile</h4>
            <dl className="kv">
              <dt>Daily creative batch</dt><dd>{Number(automation.config.count ?? 3)} posts</dd>
              <dt>Image policy</dt><dd>Licensed real photography</dd>
              <dt>Product proof</dt><dd>Exact current app captures</dd>
              <dt>Learning mode</dt><dd>Recent-hook and post-signal aware</dd>
              <dt>Release gate</dt><dd>Autonomous after TikTok Business approval</dd>
            </dl>
            {featureRotation.length > 0 ? <p className="mono muted">FEATURE ROTATION // {featureRotation.join(' · ').toUpperCase()}</p> : null}
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
