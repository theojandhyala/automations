import { useData } from '../lib/useData';
import { api } from '../lib/supabase';

interface Stage {
  key: string;
  name: string;
  description: string;
  state: 'ready' | 'manual' | 'not_configured' | 'not_built';
  blocker: string | null;
}

const LABEL: Record<Stage['state'], string> = {
  ready: 'Automated',
  manual: 'You do this',
  not_configured: 'Not configured',
  not_built: 'Not built',
};

/**
 * The nine-stage production pipeline, shown as it actually is. Four of these
 * stages have no implementation, and this rail is what stops the rest of the
 * dashboard implying otherwise -- "Not built" is the honest label for research,
 * script, assets and edit today.
 */
export default function PipelineRail() {
  const { data } = useData(() => api<{ stages: Stage[] }>('/pipeline'), [], 60_000);
  const stages = data?.stages ?? [];
  if (stages.length === 0) return null;

  const gaps = stages.filter((s) => s.state === 'not_built' || s.state === 'not_configured').length;

  return (
    <section className="brain-section">
      <h4>
        Production pipeline
        {gaps > 0 && (
          <span className="pill" style={{ marginLeft: 8, color: '#fbbf24', borderColor: '#4a3f1e' }}>
            {gaps} of {stages.length} not wired
          </span>
        )}
      </h4>
      <div className="pipeline-rail">
        {stages.map((s) => (
          <div className="stage-chip" data-state={s.state} key={s.key} title={s.description}>
            <div className="sn">{s.name}</div>
            <div className="ss">{LABEL[s.state]}</div>
            {s.blocker && <div className="sb">{s.blocker}</div>}
          </div>
        ))}
      </div>
    </section>
  );
}
