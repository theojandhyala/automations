import { useEffect, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { Ago } from './bits';
import { api } from '../lib/supabase';
import type { MissionArtifact } from './JarvisDeck';
import type { Account, AnalyticsSnapshot, App, Automation, Run } from '../lib/types';

type ProtocolStyle = CSSProperties & { '--protocol-color': string; '--protocol-index': number };
type SignalStyle = CSSProperties & { '--signal-color': string; '--signal-level': string };

function fmt(value: number | null | undefined): string {
  if (value == null) return '—';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}K`;
  return String(value);
}

function stateLabel(automation: Automation): string {
  if (!automation.enabled || automation.status === 'disabled') return 'SAFE / PAUSED';
  if (automation.status === 'running') return 'EXECUTING';
  if (automation.status === 'failed') return 'FAULT';
  return 'STANDING BY';
}

function sortedSnapshots(snapshots: AnalyticsSnapshot[]): AnalyticsSnapshot[] {
  return [...snapshots].sort((a, b) => b.captured_at.localeCompare(a.captured_at));
}

function duration(ms: number | null): string {
  if (ms == null) return 'LIVE';
  if (ms < 1000) return `${ms}MS`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}S`;
  return `${Math.floor(ms / 60_000)}M ${Math.round((ms % 60_000) / 1000)}S`;
}

function ProtocolMesh({
  automations,
  apps,
  preview,
  onOpenAgent,
  onForge,
  onChanged,
}: {
  automations: Automation[];
  apps: App[];
  preview: boolean;
  onOpenAgent: (automation: Automation) => void;
  onForge: () => void;
  onChanged: () => void;
}) {
  const [tactical, setTactical] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [fleetBusy, setFleetBusy] = useState(false);
  const [fleetMessage, setFleetMessage] = useState<string | null>(null);
  const [launchArmed, setLaunchArmed] = useState(false);
  const running = automations.filter((automation) => automation.status === 'running').length;
  const scheduled = automations.filter((automation) => automation.enabled && automation.cron).length;
  const faults = automations.filter((automation) => automation.status === 'failed').length;
  const selected = automations.filter((automation) => selectedIds.has(automation.id));

  useEffect(() => {
    const validIds = new Set(automations.map((automation) => automation.id));
    setSelectedIds((current) => new Set([...current].filter((id) => validIds.has(id))));
  }, [automations]);

  useEffect(() => {
    if (!launchArmed) return undefined;
    const timeout = window.setTimeout(() => setLaunchArmed(false), 10_000);
    return () => window.clearTimeout(timeout);
  }, [launchArmed]);

  function toggleSelection(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function fleetAction(action: 'enable' | 'pause' | 'run') {
    if (!selected.length || fleetBusy) return;
    if (action === 'run' && !launchArmed) {
      setLaunchArmed(true);
      setFleetMessage('Fleet execution armed for 10 seconds. Confirm to launch internal protocols; publishing nodes remain isolated.');
      return;
    }

    setFleetBusy(true);
    setFleetMessage(null);
    try {
      const targets = action === 'run'
        ? selected.filter((automation) => automation.handler_key !== 'tiktok.publish' && automation.status !== 'running' && automation.enabled)
        : selected;
      const withheld = action === 'run' ? selected.length - targets.length : 0;
      if (!targets.length) {
        setFleetMessage('No selected protocol can execute. Enable it first; publishing authority must be launched individually.');
        return;
      }
      if (!preview) {
        const results = await Promise.allSettled(targets.map((automation) => action === 'run'
          ? api(`/automations/${automation.id}/run`, { method: 'POST' })
          : api(`/automations/${automation.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ enabled: action === 'enable' }),
          })));
        const failed = results.filter((result) => result.status === 'rejected').length;
        const completed = results.length - failed;
        setFleetMessage(`${completed} protocol${completed === 1 ? '' : 's'} ${action === 'run' ? 'launched' : action === 'enable' ? 'armed' : 'paused'}${failed ? `; ${failed} rejected by safety validation` : ''}${withheld ? `; ${withheld} withheld` : ''}.`);
        onChanged();
      } else {
        setFleetMessage(`Preview command accepted: ${targets.length} protocol${targets.length === 1 ? '' : 's'} would be ${action === 'run' ? 'launched' : action === 'enable' ? 'armed' : 'paused'}${withheld ? `; ${withheld} would remain isolated` : ''}.`);
      }
      setLaunchArmed(false);
    } catch (error) {
      setFleetMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setFleetBusy(false);
    }
  }

  return (
    <section className="system-view protocol-view" aria-label="Automation protocol mesh">
      <header className="system-view-head">
        <div><span>J.A.R.V.I.S. // AUTOMATION TOPOLOGY</span><h3>PROTOCOL MESH</h3><p>Every executable node, trigger, mission binding and current state.</p></div>
        <div className="system-view-stats"><span><b>{automations.length}</b> NODES</span><span><b>{running}</b> ACTIVE</span><span><b>{scheduled}</b> SCHEDULED</span><span className={faults ? 'fault' : ''}><b>{faults}</b> FAULTS</span></div>
        <div className="system-view-actions">
          <button className={tactical ? 'active' : ''} type="button" onClick={() => { setTactical((current) => !current); setLaunchArmed(false); }}><i>◇</i> {tactical ? 'SELECTING' : 'FLEET CONTROL'}</button>
          <button type="button" onClick={onForge}><i>+</i> FORGE NODE</button>
        </div>
      </header>
      <div className="protocol-layout">
        <aside className="mesh-core">
          <div className="mesh-orbit" aria-hidden="true">
            <i /><i /><i /><b />
            {automations.slice(0, 8).map((automation, index) => <em key={automation.id} style={{ rotate: `${index * (360 / Math.min(automations.length, 8))}deg` }} />)}
          </div>
          <span>AUTOMATION BUS</span>
          <strong>{running ? 'LIVE EXECUTION' : 'CORE NOMINAL'}</strong>
          <small>{automations.filter((automation) => automation.enabled).length}/{automations.length} protocols accepting command</small>
          <div className="mesh-flow" aria-hidden="true">{Array.from({ length: 18 }, (_, index) => <i key={index} />)}</div>
          <dl>
            <div><dt>TRIGGER BUS</dt><dd>{scheduled} LINKED</dd></div>
            <div><dt>MANUAL NODES</dt><dd>{automations.length - scheduled}</dd></div>
            <div><dt>FAILURE BREAKERS</dt><dd>{faults ? 'ATTENTION' : 'CLEAR'}</dd></div>
          </dl>
        </aside>
        <div className="protocol-grid">
          {automations.map((automation, index) => {
            const app = apps.find((candidate) => candidate.id === automation.app_id);
            const color = automation.accent ?? app?.accent ?? '#63e7ff';
            const label = stateLabel(automation);
            return (
              <button
                type="button"
                className={`protocol-node ${automation.status} ${automation.enabled ? '' : 'paused'} ${selectedIds.has(automation.id) ? 'selected' : ''}`}
                style={{ '--protocol-color': color, '--protocol-index': index } as ProtocolStyle}
                key={automation.id}
                onClick={() => tactical ? toggleSelection(automation.id) : onOpenAgent(automation)}
                aria-pressed={tactical ? selectedIds.has(automation.id) : undefined}
                aria-label={`${automation.name}, ${label}. ${tactical ? 'Select for fleet command.' : 'Open protocol controls.'}`}
              >
                {tactical ? <span className="node-selector" aria-hidden="true"><i /></span> : null}
                <span className="node-index">N-{String(index + 1).padStart(2, '0')}</span>
                <span className="node-orb" aria-hidden="true"><i /><b /></span>
                <span className="node-copy"><small>{app?.name ?? 'SYSTEM CORE'}</small><strong>{automation.name}</strong><code>{automation.handler_key}</code></span>
                <span className="node-state"><i />{label}</span>
                <span className="node-metrics">
                  <span><small>TRIGGER</small><b>{automation.cron ? 'CRON LINK' : 'MANUAL'}</b></span>
                  <span><small>PARAMETERS</small><b>{Object.keys(automation.config).length}</b></span>
                  <span><small>FAIL STREAK</small><b>{automation.failure_streak}</b></span>
                </span>
                <span className="node-next"><small>NEXT SIGNAL</small><b>{automation.enabled ? <Ago at={automation.next_run_at} /> : 'PAUSED'}</b></span>
                <span className="node-scan" aria-hidden="true" />
              </button>
            );
          })}
          <button className="protocol-node add-node" type="button" onClick={onForge}>
            <span>+</span><strong>COMPILE NEW PROTOCOL</strong><small>Define your own intent, trigger, safeguards and parameters.</small>
          </button>
        </div>
      </div>
      {tactical ? (
        <aside className="fleet-command-bar" aria-label="Selected protocol fleet controls">
          <div className="fleet-count"><span>{String(selected.length).padStart(2, '0')}</span><div><small>SELECTED NODES</small><b>FLEET AUTHORITY</b></div></div>
          <div className="fleet-selection">{selected.length ? selected.map((automation) => <span key={automation.id}>{automation.name}</span>) : <em>SELECT PROTOCOL NODES ABOVE</em>}</div>
          {fleetMessage ? <p role="status">{fleetMessage}</p> : null}
          <div className="fleet-actions">
            <button type="button" disabled={!selected.length || fleetBusy} onClick={() => fleetAction('pause')}>PAUSE</button>
            <button type="button" disabled={!selected.length || fleetBusy} onClick={() => fleetAction('enable')}>ARM</button>
            <button className={launchArmed ? 'armed' : ''} type="button" disabled={!selected.length || fleetBusy} onClick={() => fleetAction('run')}>{launchArmed ? 'CONFIRM LAUNCH' : 'EXECUTE FLEET'}</button>
            <button type="button" disabled={!selected.length || fleetBusy} onClick={() => { setSelectedIds(new Set()); setFleetMessage(null); }}>CLEAR</button>
          </div>
        </aside>
      ) : null}
    </section>
  );
}

function SignalRoom({
  apps,
  accounts,
  snapshots,
  artifacts,
}: {
  apps: App[];
  accounts: Account[];
  snapshots: AnalyticsSnapshot[];
  artifacts: MissionArtifact[];
}) {
  const orderedSnapshots = sortedSnapshots(snapshots);
  const latestByAccount = new Map<string, AnalyticsSnapshot>();
  for (const snapshot of orderedSnapshots) {
    if (!latestByAccount.has(snapshot.account_id)) latestByAccount.set(snapshot.account_id, snapshot);
  }
  const latestSignals = [...latestByAccount.values()];
  const totalViews = latestSignals.reduce((sum, snapshot) => sum + (snapshot.views_28d ?? 0), 0);
  const totalFollowers = latestSignals.reduce((sum, snapshot) => sum + (snapshot.followers ?? 0), 0);
  const connected = accounts.filter((account) => account.status === 'connected').length;

  return (
    <section className="system-view signal-view" aria-label="JARVIS intelligence room">
      <header className="system-view-head">
        <div><span>J.A.R.V.I.S. // LEARNING ARRAY</span><h3>INTELLIGENCE ROOM</h3><p>Audience signals, mission outcomes and the evidence feeding the next decision.</p></div>
        <div className="system-view-stats"><span><b>{fmt(totalFollowers)}</b> REACH</span><span><b>{fmt(totalViews)}</b> SIGNALS</span><span><b>{connected}</b> UPLINKS</span><span><b>{snapshots.length}</b> SAMPLES</span></div>
      </header>

      <div className="signal-grid">
        {apps.map((app, index) => {
          const account = accounts.find((candidate) => candidate.app_id === app.id);
          const latest = orderedSnapshots.find((snapshot) => snapshot.app_id === app.id || snapshot.account_id === account?.id);
          const appArtifacts = artifacts.filter((artifact) => artifact.app_id === app.id);
          const published = appArtifacts.filter((artifact) => artifact.status === 'published').length;
          const drafts = appArtifacts.filter((artifact) => artifact.status === 'draft').length;
          const views = latest?.views_28d ?? 0;
          const followers = latest?.followers ?? 0;
          const signalLevel = Math.min(100, Math.max(8, Math.round(views / Math.max(followers, 1)) * 3));
          const bars = [followers, views / 9, (latest?.shares_28d ?? 0) * 8, (latest?.comments_28d ?? 0) * 10, published * 1200, drafts * 900];
          const peak = Math.max(...bars, 1);
          return (
            <article className="signal-card" style={{ '--signal-color': app.accent, '--signal-level': `${signalLevel}%` } as SignalStyle} key={app.id}>
              <span className="signal-index">SIG-0{index + 1}</span>
              <div className="signal-card-head"><span className="signal-orb"><i /><b /></span><div><small>{account ? `@${account.handle}` : 'NO CHANNEL UPLINK'}</small><h4>{app.name}</h4><p>{app.tagline ?? 'Mission intelligence'}</p></div><strong>{latest?.quality?.toUpperCase() ?? 'NO DATA'}</strong></div>
              <div className="signal-bars-chart" aria-label={`${app.name} relative signal levels`}>
                {bars.map((value, barIndex) => <i key={barIndex} style={{ height: `${Math.max(9, Math.round((value / peak) * 100))}%` }} />)}
                <span>LIVE SIGNAL DISTRIBUTION</span>
              </div>
              <div className="signal-metrics">
                <span><small>FOLLOWERS</small><b>{fmt(latest?.followers)}</b></span>
                <span><small>28D VIEWS</small><b>{fmt(latest?.views_28d)}</b></span>
                <span><small>SHARES</small><b>{fmt(latest?.shares_28d)}</b></span>
                <span><small>COMMENTS</small><b>{fmt(latest?.comments_28d)}</b></span>
              </div>
              <footer><span><b>{drafts}</b> IN REVIEW</span><span><b>{published}</b> SHIPPED</span><span><b>{account?.status?.toUpperCase() ?? 'OFFLINE'}</b> UPLINK</span></footer>
              <span className="signal-scan" aria-hidden="true" />
            </article>
          );
        })}
      </div>

      <div className="intelligence-lower">
        <section className="learning-core">
          <div className="learning-globe" aria-hidden="true"><i /><i /><i /><b /></div>
          <div><span>JARVIS LEARNING CORE</span><strong>{snapshots.length ? 'EVIDENCE STREAM ACTIVE' : 'AWAITING FIRST SIGNAL'}</strong><p>Performance evidence is mapped back to creative decisions without inventing missing data.</p></div>
          <dl><div><dt>CONNECTED SOURCES</dt><dd>{connected}/{accounts.length || 0}</dd></div><div><dt>PROOF SET</dt><dd>{artifacts.filter((artifact) => artifact.status === 'published').length}</dd></div><div><dt>DATA QUALITY</dt><dd>{orderedSnapshots.some((snapshot) => snapshot.quality !== 'ok') ? 'PARTIAL' : snapshots.length ? 'NOMINAL' : 'EMPTY'}</dd></div></dl>
        </section>
        <section className="signal-tape">
          <header><span>RECENT INTELLIGENCE ACQUISITIONS</span><b>LIVE FEED</b></header>
          <div>
            {orderedSnapshots.slice(0, 6).map((snapshot, index) => {
              const app = apps.find((candidate) => candidate.id === snapshot.app_id);
              return <article key={snapshot.id}><i style={{ background: app?.accent }} /><span><small>{new Date(snapshot.captured_at).toLocaleString()}</small><b>{app?.name ?? 'System'} signal package acquired</b></span><em>{fmt(snapshot.views_28d)} VIEWS</em><strong>0{index + 1}</strong></article>;
            })}
            {orderedSnapshots.length === 0 ? <p>NO INTELLIGENCE SAMPLES HAVE BEEN ACQUIRED.</p> : null}
          </div>
        </section>
      </div>
    </section>
  );
}

function ControlDeck({
  automations,
  apps,
  accounts,
  artifacts,
  runs,
  onOpenAgent,
  onForge,
}: {
  automations: Automation[];
  apps: App[];
  accounts: Account[];
  artifacts: MissionArtifact[];
  runs: Run[];
  onOpenAgent: (automation: Automation) => void;
  onForge: () => void;
}) {
  const automationById = new Map(automations.map((automation) => [automation.id, automation]));
  const appById = new Map(apps.map((app) => [app.id, app]));
  const settledRuns = runs.filter((run) => run.status === 'succeeded' || run.status === 'failed');
  const succeeded = settledRuns.filter((run) => run.status === 'succeeded').length;
  const successRate = settledRuns.length ? Math.round((succeeded / settledRuns.length) * 100) : 100;
  const active = runs.filter((run) => run.status === 'running' || run.status === 'queued').length;
  const failedAgents = automations.filter((automation) => automation.status === 'failed');
  const accountFaults = accounts.filter((account) => account.status !== 'connected');
  const failedArtifacts = artifacts.filter((artifact) => artifact.status === 'failed').length;
  const drafts = artifacts.filter((artifact) => artifact.status === 'draft').length;
  const incidentCount = failedAgents.length + accountFaults.length + failedArtifacts;
  const online = automations.filter((automation) => automation.enabled).length;
  const readiness = Math.max(0, Math.round(
    successRate * 0.55
    + (automations.length ? (online / automations.length) * 25 : 25)
    + (accounts.length ? (accounts.length - accountFaults.length) / accounts.length * 20 : 20)
    - Math.min(20, incidentCount * 5),
  ));
  const recentRuns = runs.slice(0, 9);
  const runBars = runs.slice(0, 24).reverse();

  return (
    <section className="system-view control-view" aria-label="JARVIS sovereign control deck">
      <header className="system-view-head">
        <div><span>J.A.R.V.I.S. // SOVEREIGN AUTHORITY</span><h3>CONTROL DECK</h3><p>Execution history, incident truth and the full operating envelope.</p></div>
        <div className="system-view-stats"><span><b>{successRate}%</b> SUCCESS</span><span><b>{active}</b> LIVE</span><span><b>{runs.length}</b> TRACES</span><span className={incidentCount ? 'fault' : ''}><b>{incidentCount}</b> INCIDENTS</span></div>
        <button type="button" onClick={onForge}><i>+</i> NEW AUTHORITY</button>
      </header>

      <div className="control-layout">
        <section className="sovereign-core">
          <span className="sovereign-coordinate top">AUTH // OWNER-01</span>
          <span className="sovereign-coordinate side">COMMAND ENVELOPE // SEALED</span>
          <div className="sovereign-reactor" aria-hidden="true">
            <span className="sovereign-orbit orbit-one"><i /><i /><i /></span>
            <span className="sovereign-orbit orbit-two"><i /><i /><i /><i /></span>
            <span className="sovereign-orbit orbit-three"><i /><i /></span>
            <b><i /></b>
          </div>
          <div className="sovereign-score"><small>SYSTEM DOMINANCE</small><strong>{readiness}</strong><span>/100</span></div>
          <p>{incidentCount ? 'Authority intact. Aegis has isolated the active issues below.' : 'All configured authority channels are nominal and accepting command.'}</p>
          <div className="sovereign-wave" aria-hidden="true">{Array.from({ length: 30 }, (_, index) => <i key={index} />)}</div>
          <dl>
            <div><dt>PROTOCOL AUTHORITY</dt><dd>{online}/{automations.length}</dd></div>
            <div><dt>OWNER REVIEW</dt><dd>{drafts}</dd></div>
            <div><dt>FAIL-SAFE</dt><dd>{incidentCount ? 'CONTAINING' : 'ARMED'}</dd></div>
          </dl>
        </section>

        <section className="execution-ledger">
          <header><div><span>EXECUTION TRACE</span><b>RECENT OPERATIONS</b></div><em><i /> LIVE LEDGER</em></header>
          <div className="trace-spectrum" aria-label="Recent execution outcomes">
            {runBars.map((run, index) => <i className={run.status} style={{ height: `${28 + ((index * 19) % 68)}%` }} key={run.id} />)}
            {runBars.length === 0 ? <span>AWAITING FIRST EXECUTION TRACE</span> : null}
          </div>
          <div className="trace-list">
            {recentRuns.map((run, index) => {
              const automation = automationById.get(run.automation_id);
              const app = automation?.app_id ? appById.get(automation.app_id) : undefined;
              return (
                <button type="button" key={run.id} onClick={() => automation && onOpenAgent(automation)} disabled={!automation}>
                  <span className={`trace-state ${run.status}`}><i />{run.status.toUpperCase()}</span>
                  <span className="trace-copy"><small>{app?.name ?? 'SYSTEM CORE'} // {run.trigger.toUpperCase()}</small><b>{automation?.name ?? 'Detached execution trace'}</b></span>
                  <span className="trace-time"><b>{duration(run.duration_ms)}</b><small><Ago at={run.started_at} /></small></span>
                  <em>{String(index + 1).padStart(2, '0')}</em>
                </button>
              );
            })}
            {recentRuns.length === 0 ? <p>NO RUN HISTORY HAS BEEN RECORDED.</p> : null}
          </div>
        </section>

        <section className="aegis-array">
          <header><div><span>AEGIS SENTINEL</span><b>INCIDENT & CONSTRAINT ARRAY</b></div><em className={incidentCount ? 'attention' : ''}>{incidentCount ? `${incidentCount} ACTIONABLE` : 'PERIMETER CLEAR'}</em></header>
          <div className="aegis-list">
            {failedAgents.map((automation) => (
              <button type="button" key={automation.id} onClick={() => onOpenAgent(automation)}>
                <span className="aegis-icon critical"><i /></span><span><small>PROTOCOL FAULT</small><b>{automation.name}</b><p>{automation.current_task ?? 'Execution breaker engaged after a failed run.'}</p></span><em>INSPECT →</em>
              </button>
            ))}
            {accountFaults.map((account) => (
              <Link to="/accounts" key={account.id}>
                <span className="aegis-icon warning"><i /></span><span><small>UPLINK {account.status.toUpperCase()}</small><b>@{account.handle}</b><p>External delivery remains safely isolated until the channel is restored.</p></span><em>RESOLVE →</em>
              </Link>
            ))}
            {failedArtifacts ? (
              <Link to="/queue"><span className="aegis-icon critical"><i /></span><span><small>PRODUCTION EXCEPTION</small><b>{failedArtifacts} failed artifact{failedArtifacts === 1 ? '' : 's'}</b><p>Review the exact failure evidence before relaunching production.</p></span><em>REVIEW →</em></Link>
            ) : null}
            {drafts ? (
              <Link to="/queue"><span className="aegis-icon nominal"><i /></span><span><small>OWNER AUTHORITY REQUIRED</small><b>{drafts} creation{drafts === 1 ? '' : 's'} awaiting review</b><p>Nothing leaves the system without your explicit approval.</p></span><em>AUTHORISE →</em></Link>
            ) : null}
            {!incidentCount && !drafts ? (
              <article className="aegis-clear"><span className="aegis-shield"><i /><b /></span><div><small>ZERO CRITICAL FAULTS</small><b>AEGIS PERIMETER NOMINAL</b><p>Execution breakers, publishing consent and data integrity checks are standing guard.</p></div></article>
            ) : null}
          </div>
        </section>

        <section className="authority-grid">
          {apps.map((app, index) => {
            const appAutomations = automations.filter((automation) => automation.app_id === app.id);
            const appAccount = accounts.find((account) => account.app_id === app.id);
            const state = app.promotion_enabled === false ? 'RELEASE LOCK' : appAccount?.status === 'connected' ? 'FULL AUTHORITY' : 'INTERNAL ONLY';
            return (
              <article style={{ '--protocol-color': app.accent, '--protocol-index': index } as ProtocolStyle} key={app.id}>
                <span>AUTH-0{index + 1}</span><i aria-hidden="true"><b /></i><div><small>{state}</small><strong>{app.name}</strong><p>{appAutomations.filter((automation) => automation.enabled).length}/{appAutomations.length} protocols online</p></div><em>{artifacts.filter((artifact) => artifact.app_id === app.id && artifact.status === 'published').length} SHIPPED</em>
              </article>
            );
          })}
        </section>
      </div>
    </section>
  );
}

export default function SystemViews({
  mode,
  automations,
  apps,
  accounts,
  snapshots,
  artifacts,
  runs,
  preview,
  onOpenAgent,
  onForge,
  onChanged,
}: {
  mode: 'protocols' | 'signals' | 'operations';
  automations: Automation[];
  apps: App[];
  accounts: Account[];
  snapshots: AnalyticsSnapshot[];
  artifacts: MissionArtifact[];
  runs: Run[];
  preview: boolean;
  onOpenAgent: (automation: Automation) => void;
  onForge: () => void;
  onChanged: () => void;
}) {
  if (mode === 'protocols') return <ProtocolMesh automations={automations} apps={apps} preview={preview} onOpenAgent={onOpenAgent} onForge={onForge} onChanged={onChanged} />;
  if (mode === 'signals') return <SignalRoom apps={apps} accounts={accounts} snapshots={snapshots} artifacts={artifacts} />;
  return <ControlDeck automations={automations} apps={apps} accounts={accounts} artifacts={artifacts} runs={runs} onOpenAgent={onOpenAgent} onForge={onForge} />;
}
