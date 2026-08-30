import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { api, supabase } from '../lib/supabase';
import { useData } from '../lib/useData';
import { Ago, Dot, Duration, Empty } from '../components/bits';
import type { Automation, Run, RunEvent } from '../lib/types';

export default function AutomationDetail() {
  const { id } = useParams<{ id: string }>();
  const [params, setParams] = useSearchParams();
  const selectedRunId = params.get('run');
  const [configDraft, setConfigDraft] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const { data, error, refresh } = useData(async () => {
    const [automation, runs] = await Promise.all([
      supabase.from('automations').select('*').eq('id', id).single(),
      supabase.from('runs').select('*').eq('automation_id', id)
        .order('started_at', { ascending: false }).limit(30),
    ]);
    if (automation.error) throw automation.error;
    if (runs.error) throw runs.error;
    return { automation: automation.data as Automation, runs: runs.data as Run[] };
  }, [id]);

  const activeRunId = selectedRunId ?? data?.runs[0]?.id ?? null;

  const { data: events } = useData(async () => {
    if (!activeRunId) return [];
    const { data, error } = await supabase.from('run_events').select('*')
      .eq('run_id', activeRunId).order('id');
    if (error) throw error;
    return data as RunEvent[];
  }, [activeRunId], 3000);

  async function patch(body: Record<string, unknown>) {
    setSaveError(null);
    try {
      await api(`/automations/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
      refresh();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    }
  }

  async function saveConfig() {
    if (configDraft === null) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(configDraft);
    } catch {
      setSaveError('Config must be valid JSON');
      return;
    }
    await patch({ config: parsed });
    setConfigDraft(null);
  }

  if (error) return <div className="card" style={{ color: 'var(--bad)' }}>{error}</div>;
  if (!data) return <Empty>Loading…</Empty>;

  const { automation, runs } = data;

  return (
    <>
      <div className="page-head">
        <div>
          <h2><Dot status={automation.status} /> {automation.name}</h2>
          <p className="mono">{automation.handler_key}</p>
        </div>
        <div className="row">
          <button
            onClick={() => api(`/automations/${id}/run`, { method: 'POST' }).then(refresh)}
            disabled={automation.status === 'running'}
          >
            Run now
          </button>
          <button onClick={() => patch({ enabled: !automation.enabled })}>
            {automation.enabled ? 'Pause' : 'Enable'}
          </button>
        </div>
      </div>

      {saveError && <div className="card" style={{ color: 'var(--bad)', marginBottom: 14 }}>{saveError}</div>}

      <div className="card" style={{ marginBottom: 22 }}>
        <div className="field">
          <label>Schedule (5-field cron, UTC — blank for manual only)</label>
          <input
            defaultValue={automation.cron ?? ''}
            placeholder="0 */6 * * *"
            onBlur={(e) => {
              const value = e.target.value.trim();
              if (value !== (automation.cron ?? '')) patch({ cron: value || null });
            }}
          />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Config</label>
          <textarea
            className="mono"
            value={configDraft ?? JSON.stringify(automation.config, null, 2)}
            onChange={(e) => setConfigDraft(e.target.value)}
          />
        </div>
        {configDraft !== null && (
          <div className="row" style={{ marginTop: 10 }}>
            <button className="primary" onClick={saveConfig}>Save config</button>
            <button onClick={() => { setConfigDraft(null); setSaveError(null); }}>Cancel</button>
          </div>
        )}
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(260px, 340px) 1fr', alignItems: 'start' }}>
        <div className="card" style={{ padding: 0 }}>
          <table>
            <thead><tr><th>Run</th><th>Took</th></tr></thead>
            <tbody>
              {runs.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => setParams({ run: r.id })}
                  style={{
                    cursor: 'pointer',
                    background: r.id === activeRunId ? 'var(--panel-2)' : undefined,
                  }}
                >
                  <td>
                    <div className="row"><Dot status={r.status} /><Ago at={r.started_at} /></div>
                    <div className="muted" style={{ fontSize: 12 }}>{r.trigger}</div>
                  </td>
                  <td><Duration ms={r.duration_ms} /></td>
                </tr>
              ))}
              {runs.length === 0 && <tr><td colSpan={2}><Empty>No runs yet.</Empty></td></tr>}
            </tbody>
          </table>
        </div>

        <div className="logs mono">
          {(events ?? []).map((e) => (
            <div key={e.id} className={`line ${e.level}`}>
              <span className="ts">{new Date(e.at).toISOString().slice(11, 19)}</span>
              <span>
                {e.message}
                {e.data != null && (
                  <span className="muted"> {JSON.stringify(e.data)}</span>
                )}
              </span>
            </div>
          ))}
          {(events ?? []).length === 0 && <Empty>No log lines for this run.</Empty>}
        </div>
      </div>
    </>
  );
}
