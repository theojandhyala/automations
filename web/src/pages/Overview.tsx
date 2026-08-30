import { Link } from 'react-router-dom';
import { api, supabase } from '../lib/supabase';
import { useData } from '../lib/useData';
import { Ago, Dot, Duration, Empty, Pill } from '../components/bits';
import type { Automation, Run } from '../lib/types';

async function load() {
  const [automations, runs, queue] = await Promise.all([
    supabase.from('automations').select('*').order('name'),
    supabase.from('runs').select('*').order('started_at', { ascending: false }).limit(15),
    supabase.from('artifacts').select('id,status').in('status', ['draft', 'approved', 'publishing']),
  ]);
  if (automations.error) throw automations.error;
  if (runs.error) throw runs.error;
  if (queue.error) throw queue.error;
  return {
    automations: automations.data as Automation[],
    runs: runs.data as Run[],
    queue: queue.data as Array<{ status: string }>,
  };
}

export default function Overview() {
  const { data, error, refresh } = useData(load, []);

  async function killAll() {
    if (!confirm('Disable every running automation? Nothing will be scheduled until you re-enable it.')) return;
    await api('/kill', { method: 'POST' });
    refresh();
  }

  async function runNow(id: string) {
    await api(`/automations/${id}/run`, { method: 'POST' });
    refresh();
  }

  async function toggle(a: Automation) {
    await api(`/automations/${a.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled: !a.enabled }),
    });
    refresh();
  }

  if (error) return <div className="card" style={{ color: 'var(--bad)' }}>{error}</div>;
  if (!data) return <Empty>Loading…</Empty>;

  const { automations, runs, queue } = data;
  const failing = automations.filter((a) => a.status === 'failed' || a.status === 'disabled').length;
  const last24h = runs.filter((r) => Date.parse(r.started_at) > Date.now() - 86_400_000);

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Overview</h2>
          <p>{automations.filter((a) => a.enabled).length} of {automations.length} automations enabled</p>
        </div>
        <button className="danger" onClick={killAll}>Stop everything</button>
      </div>

      <div className="grid stats" style={{ marginBottom: 22 }}>
        <div className="card stat">
          <div className="label">Awaiting review</div>
          <div className="value">{queue.filter((a) => a.status === 'draft').length}</div>
        </div>
        <div className="card stat">
          <div className="label">Approved</div>
          <div className="value">{queue.filter((a) => a.status === 'approved').length}</div>
        </div>
        <div className="card stat">
          <div className="label">In flight</div>
          <div className="value">{queue.filter((a) => a.status === 'publishing').length}</div>
        </div>
        <div className="card stat">
          <div className="label">Runs (24h)</div>
          <div className="value">{last24h.length}</div>
        </div>
        <div className="card stat">
          <div className="label">Needs attention</div>
          <div className="value" style={{ color: failing ? 'var(--bad)' : undefined }}>{failing}</div>
        </div>
      </div>

      <div className="card" style={{ padding: 0, marginBottom: 22 }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Automation</th>
                <th>Schedule</th>
                <th>Last run</th>
                <th>Next</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {automations.map((a) => (
                <tr key={a.id}>
                  <td>
                    <div className="row">
                      <Dot status={a.status} />
                      <Link to={`/automations/${a.id}`}>{a.name}</Link>
                      {a.failure_streak > 0 && <Pill>{a.failure_streak} failed in a row</Pill>}
                    </div>
                    <div className="muted mono" style={{ marginTop: 3 }}>{a.handler_key}</div>
                  </td>
                  <td className="mono">{a.cron ?? <span className="muted">manual</span>}</td>
                  <td><Ago at={a.last_run_at} /></td>
                  <td>{a.enabled ? <Ago at={a.next_run_at} /> : <span className="muted">paused</span>}</td>
                  <td>
                    <div className="row" style={{ justifyContent: 'flex-end' }}>
                      <button onClick={() => runNow(a.id)} disabled={a.status === 'running'}>Run</button>
                      <button onClick={() => toggle(a)}>{a.enabled ? 'Pause' : 'Enable'}</button>
                    </div>
                  </td>
                </tr>
              ))}
              {automations.length === 0 && (
                <tr><td colSpan={5}><Empty>No automations yet.</Empty></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <h3 style={{ fontSize: 14, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Recent runs
      </h3>
      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Automation</th><th>Trigger</th><th>Started</th><th>Took</th><th>Result</th></tr>
            </thead>
            <tbody>
              {runs.map((r) => {
                const automation = automations.find((a) => a.id === r.automation_id);
                return (
                  <tr key={r.id}>
                    <td>
                      <div className="row">
                        <Dot status={r.status} />
                        <Link to={`/automations/${r.automation_id}?run=${r.id}`}>
                          {automation?.name ?? 'unknown'}
                        </Link>
                      </div>
                    </td>
                    <td className="muted">{r.trigger}</td>
                    <td><Ago at={r.started_at} /></td>
                    <td><Duration ms={r.duration_ms} /></td>
                    <td className="mono muted">
                      {r.error ?? (r.result ? JSON.stringify(r.result) : '—')}
                    </td>
                  </tr>
                );
              })}
              {runs.length === 0 && <tr><td colSpan={5}><Empty>Nothing has run yet.</Empty></td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
