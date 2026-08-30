import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useData } from '../lib/useData';
import JarvisDeck from '../components/JarvisDeck';
import AgentBrain from '../components/AgentBrain';
import CommandBar from '../components/CommandBar';
import ScheduleStrip from '../components/ScheduleStrip';
import PipelineRail from '../components/PipelineRail';
import AnalyticsCards from '../components/AnalyticsCards';
import type { Account, AnalyticsSnapshot, App, Automation } from '../lib/types';

/** The live system overview: JARVIS kernel, agent matrix, schedule and commands. */
export default function CommandCenter() {
  const [openAgent, setOpenAgent] = useState<string | null>(null);
  const [coreOpen, setCoreOpen] = useState(false);

  const { data, refresh } = useData(async () => {
    const [automations, apps, accounts, queue, snapshots] = await Promise.all([
      supabase.from('automations').select('*').order('orbit_ring').order('orbit_position'),
      supabase.from('apps').select('*').order('sort_order'),
      supabase.from('tiktok_accounts_public').select('*'),
      supabase.from('artifacts').select('id,status').in('status', ['draft', 'approved', 'publishing']),
      supabase.from('analytics_snapshots').select('*')
        .order('captured_at', { ascending: false }).limit(40),
    ]);
    if (automations.error) throw automations.error;
    return {
      automations: (automations.data ?? []) as Automation[],
      apps: (apps.data ?? []) as App[],
      accounts: (accounts.data ?? []) as Account[],
      queue: (queue.data ?? []) as Array<{ status: string }>,
      snapshots: (snapshots.data ?? []) as AnalyticsSnapshot[],
    };
  }, [], 4000);

  if (!data) {
    return (
      <div className="cc">
        <div className="cc-stage muted">Bringing the core online…</div>
      </div>
    );
  }

  const { automations, apps, accounts, queue, snapshots } = data;
  const working = automations.filter((a) => a.status === 'running');
  const failing = automations.filter((a) => a.status === 'failed' || a.status === 'disabled');
  const drafts = queue.filter((a) => a.status === 'draft').length;
  const agent = automations.find((a) => a.id === openAgent);

  // Latest snapshot per account, summed -- a rough "reach" number for the HUD.
  const latestByAccount = new Map<string, AnalyticsSnapshot>();
  for (const s of snapshots) {
    if (!latestByAccount.has(s.account_id)) latestByAccount.set(s.account_id, s);
  }
  const followers = [...latestByAccount.values()].reduce((sum, s) => sum + (s.followers ?? 0), 0);

  const online = automations.filter((a) => a.enabled).length;

  return (
    <div className={`cc ${agent || coreOpen ? 'has-drawer' : ''}`}>
      <div className="grid-plane" aria-hidden="true" />
      <div className="stark-scan" aria-hidden="true" />

      <header className="cc-head">
        <div>
          <p className="cc-title"><i /> Stark operating environment</p>
          <h2 className="cc-sub">
            {working.length > 0
              ? `J.A.R.V.I.S. // ${working.length} protocol${working.length === 1 ? '' : 's'} executing`
              : failing.length > 0
                ? `J.A.R.V.I.S. // ${failing.length} system fault${failing.length === 1 ? '' : 's'}`
                : 'J.A.R.V.I.S. // ONLINE'}
          </h2>
          <p className="cc-status-line">
            <span>Voice command linked</span>
            <b>•</b>
            <span>{online} agent protocols ready</span>
          </p>
        </div>

        <div className="cc-head-right">
          <div className="hud-chip">
            <div className="k">Agents</div>
            <div className="v">{automations.filter((a) => a.enabled).length}/{automations.length}</div>
          </div>
          <div className="hud-chip">
            <div className="k">To review</div>
            <div className="v">{drafts}</div>
          </div>
          <div className="hud-chip">
            <div className="k">Followers</div>
            <div className="v">{latestByAccount.size ? followers.toLocaleString() : '—'}</div>
          </div>
          <div className={`hud-chip ${failing.length ? 'alert' : ''}`}>
            <div className="k">Attention</div>
            <div className="v">{failing.length}</div>
          </div>
        </div>
      </header>

      <div className="cc-stage">
        <JarvisDeck
          automations={automations}
          apps={apps}
          accounts={accounts}
          drafts={drafts}
          onOpenAgent={(a) => setOpenAgent(a.id)}
          onOpenCore={() => setCoreOpen(true)}
        />
      </div>

      <footer className="cc-foot">
        <ScheduleStrip
          automations={automations}
          apps={apps}
          onOpenAgent={(a) => setOpenAgent(a.id)}
        />
        <CommandBar
          automations={automations}
          apps={apps}
          accounts={accounts}
          drafts={drafts}
          onOpenAgent={(automation) => setOpenAgent(automation.id)}
          onChanged={refresh}
        />
      </footer>

      {agent && (
        <AgentBrain
          automation={agent}
          apps={apps}
          onClose={() => setOpenAgent(null)}
          onChanged={refresh}
        />
      )}

      {coreOpen && (
        <CoreOverlay
          apps={apps}
          accounts={accounts}
          snapshots={snapshots}
          onClose={() => setCoreOpen(false)}
        />
      )}
    </div>
  );
}

/** Opened by clicking the core: the whole-system view rather than one agent. */
function CoreOverlay({
  apps,
  accounts,
  snapshots,
  onClose,
}: {
  apps: App[];
  accounts: Account[];
  snapshots: AnalyticsSnapshot[];
  onClose: () => void;
}) {
  return (
    <>
      <div className="brain-scrim" onClick={onClose} />
      <aside className="brain" role="dialog" aria-modal="true" aria-label="Control plane summary">
        <header className="brain-head">
          <div className="row between">
            <h3>Core</h3>
            <button onClick={onClose} aria-label="Close">✕</button>
          </div>
        </header>
        <div className="brain-body">
          <PipelineRail />
          <section className="brain-section">
            <h4>Workspaces</h4>
            <div className="grid" style={{ gap: 8 }}>
              {apps.map((app) => (
                <div className="row between" key={app.id}>
                  <span className="row">
                    <span className="dot" style={{ background: app.accent }} />
                    {app.name}
                  </span>
                  <span className="muted">
                    {accounts.filter((a) => a.app_id === app.id).length} account(s)
                  </span>
                </div>
              ))}
            </div>
          </section>
          <section className="brain-section">
            <h4>Analytics</h4>
            <AnalyticsCards apps={apps} accounts={accounts} snapshots={snapshots} />
          </section>
          <Link to="/reports" onClick={onClose}>Open reports →</Link>
        </div>
      </aside>
    </>
  );
}
