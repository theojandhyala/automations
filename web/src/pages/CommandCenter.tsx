import { lazy, Suspense, useEffect, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { api, supabase } from '../lib/supabase';
import { useData } from '../lib/useData';
import JarvisDeck, { type MissionArtifact, type MissionReadiness } from '../components/JarvisDeck';
import AgentBrain from '../components/AgentBrain';
import ScheduleStrip from '../components/ScheduleStrip';
import HudAtmosphere from '../components/HudAtmosphere';
import type { Account, AnalyticsSnapshot, App, Automation, PostMetric, Run } from '../lib/types';
import ArcReactorMark from '../components/ArcReactorMark';
import type { AutomationHandler, ProtocolForgeMode } from '../components/ProtocolForge';
import LiveTelemetryBadge from '../components/LiveTelemetryBadge';

const ProtocolForge = lazy(() => import('../components/ProtocolForge'));
const SystemViews = lazy(() => import('../components/SystemViews'));
const OperatorControls = lazy(() => import('../components/OperatorControls'));
const CommandBar = lazy(() => import('../components/CommandBar'));

type CommandMode = 'missions' | 'protocols' | 'signals' | 'operations';
interface ForgeSession { mode: ProtocolForgeMode; automation: Automation | null }

const SYSTEM_TIME_FORMATTER = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export interface CommandCenterPreviewData {
  automations: Automation[];
  apps: App[];
  accounts: Account[];
  queue: MissionArtifact[];
  snapshots: AnalyticsSnapshot[];
  postMetrics: PostMetric[];
  readiness: MissionReadiness[];
  handlers: AutomationHandler[];
  runs: Run[];
}

const APP_SLUGS = ['deadset', 'cast', 'lifescore'];
const POSTING_HANDLERS = ['tiktok.generate', 'tiktok.produce', 'tiktok.publish', 'tiktok.reconcile', 'analytics.sync'];

/** The live system overview: JARVIS kernel, agent matrix, schedule and commands. */
export default function CommandCenter({ previewData }: { previewData?: CommandCenterPreviewData }) {
  const [openAgent, setOpenAgent] = useState<string | null>(null);
  const [coreOpen, setCoreOpen] = useState(false);
  const [forgeSession, setForgeSession] = useState<ForgeSession | null>(null);
  const [mode, setMode] = useState<CommandMode>('missions');

  const { data, refresh } = useData(async () => {
    if (previewData) return previewData;
    const [automations, apps, accounts, queue, snapshots, postMetrics, runs, promotion, registry] = await Promise.all([
      supabase.from('automations').select('*').in('handler_key', POSTING_HANDLERS).order('orbit_ring').order('orbit_position'),
      supabase.from('apps').select('*').in('slug', APP_SLUGS).order('sort_order'),
      supabase.from('tiktok_accounts_public').select('*'),
      supabase.from('artifacts').select('id,app_id,status,created_at,published_at,hook,tiktok_post_id').order('created_at', { ascending: false }).limit(500),
      supabase.from('analytics_snapshots').select('*')
        .order('captured_at', { ascending: false }).limit(40),
      supabase.from('post_metrics').select('*')
        .order('captured_at', { ascending: false }).limit(200),
      supabase.from('runs').select('*').order('started_at', { ascending: false }).limit(80),
      api<{ apps: MissionReadiness[] }>('/promotion/readiness'),
      api<{ handlers: AutomationHandler[] }>('/handlers'),
    ]);
    if (automations.error) throw automations.error;
    return {
      automations: (automations.data ?? []) as Automation[],
      apps: (apps.data ?? []) as App[],
      accounts: (accounts.data ?? []) as Account[],
      queue: (queue.data ?? []) as MissionArtifact[],
      snapshots: (snapshots.data ?? []) as AnalyticsSnapshot[],
      postMetrics: (postMetrics.data ?? []) as PostMetric[],
      readiness: promotion.apps,
      handlers: registry.handlers,
      runs: (runs.data ?? []) as Run[],
    };
  }, [previewData], previewData ? 0 : 4000);

  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editing = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;
      if (editing || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === '1') setMode('missions');
      if (event.key === '2') setMode('protocols');
      if (event.key === '3') setMode('signals');
      if (event.key === '4') setMode('operations');
      if (event.key.toLowerCase() === 'f') setForgeSession({ mode: 'create', automation: null });
    };
    window.addEventListener('keydown', onShortcut);
    return () => window.removeEventListener('keydown', onShortcut);
  }, []);

  if (!data) {
    return (
      <div className="cc">
        <div className="cc-stage muted">Bringing the core online…</div>
      </div>
    );
  }

  const { automations, apps, accounts, queue, snapshots, postMetrics, readiness, handlers, runs } = data;
  const working = automations.filter((a) => a.status === 'running');
  const failing = automations.filter((a) => a.status === 'failed');
  const connectionFaults = accounts.filter((account) => account.status !== 'connected').length;
  const attentionCount = failing.length + connectionFaults;
  const drafts = queue.filter((a) => a.status === 'draft').length;
  const agent = automations.find((a) => a.id === openAgent);
  const blockedPublishing = readiness.filter((item) => ['deadset', 'cast'].includes(item.slug) && !item.publishing_ready);
  const autonomousDelivery = readiness
    .filter((item) => ['deadset', 'cast'].includes(item.slug))
    .every((item) => item.publishing_ready);

  // Latest snapshot per account, summed -- a rough "reach" number for the HUD.
  const latestByAccount = new Map<string, AnalyticsSnapshot>();
  for (const s of snapshots) {
    if (!latestByAccount.has(s.account_id)) latestByAccount.set(s.account_id, s);
  }
  const followers = [...latestByAccount.values()].reduce((sum, s) => sum + (s.followers ?? 0), 0);

  return (
    <div className={`cc mode-${mode} ${agent || coreOpen ? 'has-drawer' : ''}`}>
      <HudAtmosphere />
      <div className="grid-plane" aria-hidden="true" />
      <div className="stark-scan" aria-hidden="true" />

      <header className="cc-head">
        <div className="cc-identity">
          <ArcReactorMark size={48} label="JARVIS system core" />
          <div>
          <p className="cc-title"><i /> Stark operating environment <b>MK VII</b></p>
          <h2 className="cc-sub">
            {working.length > 0
              ? `J.A.R.V.I.S. // ${working.length} mission${working.length === 1 ? '' : 's'} executing`
              : attentionCount > 0
                ? `J.A.R.V.I.S. // ${attentionCount} system fault${attentionCount === 1 ? '' : 's'}`
                : 'J.A.R.V.I.S. // ONLINE'}
          </h2>
          <p className="cc-status-line">
            <span className="signal-bars"><i /><i /><i /><i /></span>
            <span>Command bus online</span>
            <b>•</b>
            <span>3/3 mission channels mapped</span>
            <b>•</b>
            <span className="encrypted-label">OWNER SESSION // LOCKED</span>
          </p>
          <nav className="cc-mode-switch" aria-label="Command center mode" role="tablist">
            {([
              ['missions', '01', 'MISSIONS'],
              ['protocols', '02', 'PROTOCOLS'],
              ['signals', '03', 'INTELLIGENCE'],
              ['operations', '04', 'CONTROL'],
            ] as const).map(([nextMode, index, label]) => (
              <button type="button" role="tab" aria-selected={mode === nextMode} className={mode === nextMode ? 'active' : ''} key={nextMode} onClick={() => setMode(nextMode)}><i>{index}</i>{label}</button>
            ))}
            <span>KEYS 1–4 // F FORGE</span>
          </nav>
          </div>
        </div>

        <div className="cc-head-right">
          <div className="cc-head-controls">
            <Suspense fallback={null}>
              <OperatorControls
                attention={attentionCount}
                active={working.length}
                connected={accounts.filter((account) => account.status === 'connected').length}
                protocols={automations.length}
              />
            </Suspense>
            <button className="forge-launch" type="button" onClick={() => setForgeSession({ mode: 'create', automation: null })}><i>+</i><span><small>BUILD AUTOMATION</small><b>FORGE PROTOCOL</b></span></button>
          </div>
          <div className="cc-head-metrics" aria-label="System telemetry">
            <div className="hud-chip">
              <div className="k">Missions</div>
              <div className="v">3</div>
            </div>
            <div className="hud-chip">
              <div className="k">To review</div>
              <div className="v">{drafts}</div>
            </div>
            <div className="hud-chip">
              <div className="k">Followers</div>
              <div className="v">{latestByAccount.size ? followers.toLocaleString() : '—'}</div>
            </div>
            <div className={`hud-chip ${attentionCount ? 'alert' : ''}`}>
              <div className="k">Attention</div>
              <div className="v">{attentionCount}</div>
            </div>
            <LiveTelemetryBadge compact />
            <div className="hud-clock" aria-label="System clock">
              <span>SYS TIME</span>
              <b>{SYSTEM_TIME_FORMATTER.format(new Date())}</b>
              <i>LOCAL TIME</i>
            </div>
          </div>
        </div>
      </header>

      {mode === 'missions' && (
        <section className={`home-command-rail ${blockedPublishing.length ? 'blocked' : 'nominal'}`} aria-label="Mission launch controls">
          <div className="home-rail-reactor" aria-hidden="true">
            <i /><i /><span /><b />
          </div>
          <div className="home-rail-copy" role="status">
            <span>{blockedPublishing.length ? 'EXTERNAL DELIVERY INTERLOCK' : 'DELIVERY AUTHORITY CONFIRMED'}</span>
            <strong>{blockedPublishing.length ? 'Creations are secured in review until TikTok access is authorised.' : 'All mission channels are cleared for autonomous delivery.'}</strong>
            <p>{blockedPublishing.length ? `${drafts} creations are protected. Connect the uplink before the next public release window.` : 'J.A.R.V.I.S. can generate, review and release each scheduled mission on command.'}</p>
          </div>
          <nav className="home-rail-actions" aria-label="Mission shortcuts">
            <Link to="/promote"><small>01</small><span><b>COMPOSE</b><em>New mission</em></span></Link>
            <Link to="/queue"><small>02</small><span><b>REVIEW</b><em>{drafts} waiting</em></span></Link>
            <Link to="/studio"><small>03</small><span><b>PROOF</b><em>Creative lab</em></span></Link>
            <Link className={blockedPublishing.length ? 'urgent' : ''} to="/accounts"><small>04</small><span><b>UPLINKS</b><em>{blockedPublishing.length ? 'Action needed' : 'Connected'}</em></span></Link>
          </nav>
        </section>
      )}

      <div className="cc-stage">
        {mode === 'missions' ? (
          <JarvisDeck
            automations={automations}
            apps={apps}
            accounts={accounts}
            artifacts={queue}
            readiness={readiness}
            onOpenAgent={(a) => setOpenAgent(a.id)}
            onOpenCore={() => setCoreOpen(true)}
          />
        ) : (
          <Suspense fallback={<div className="system-view-loading" role="status">SYNCHRONIZING {mode.toUpperCase()} ARRAY…</div>}>
            <SystemViews
              mode={mode}
              automations={automations}
              apps={apps}
              accounts={accounts}
              snapshots={snapshots}
              postMetrics={postMetrics}
              artifacts={queue}
              runs={runs}
              onOpenAgent={(automation) => setOpenAgent(automation.id)}
              preview={Boolean(previewData)}
              onChanged={refresh}
              onForge={() => setForgeSession({ mode: 'create', automation: null })}
            />
          </Suspense>
        )}
      </div>

      <footer className="cc-foot">
        <div className="deck-telemetry" aria-hidden="true">
          <span>MISSION LOCK <b>3/3</b></span>
          <i />
          <span>ACTIVE MISSIONS <b>{working.length}</b></span>
          <i />
          <span>{autonomousDelivery ? 'AUTONOMOUS RELEASE' : 'TIKTOK APPROVAL GATE'} <b>{autonomousDelivery ? 'ON' : 'WAITING'}</b></span>
          <i />
          <span>WAITING REVIEW <b>{drafts}</b></span>
        </div>
        <ScheduleStrip
          automations={automations}
          apps={apps}
          onOpenAgent={(a) => setOpenAgent(a.id)}
        />
        <Suspense fallback={<div className="command-link-loading" role="status">INITIALIZING UNIVERSAL ACTION BUS…</div>}>
          <CommandBar
            automations={automations}
            apps={apps}
            accounts={accounts}
            drafts={drafts}
            onOpenAgent={(automation) => setOpenAgent(automation.id)}
            onOpenForge={() => setForgeSession({ mode: 'create', automation: null })}
            onSetMode={setMode}
            onChanged={refresh}
          />
        </Suspense>
      </footer>

      {agent && (
        <AgentBrain
          automation={agent}
          apps={apps}
          onClose={() => setOpenAgent(null)}
          onChanged={refresh}
          onEdit={() => {
            setOpenAgent(null);
            setForgeSession({ mode: 'edit', automation: agent });
          }}
          onClone={() => {
            setOpenAgent(null);
            setForgeSession({ mode: 'clone', automation: agent });
          }}
        />
      )}

      {coreOpen && (
        <CoreOverlay
          apps={apps}
          accounts={accounts}
          snapshots={snapshots}
          automations={automations}
          artifacts={queue}
          onOpenForge={() => setForgeSession({ mode: 'create', automation: null })}
          onClose={() => setCoreOpen(false)}
        />
      )}

      {forgeSession && (
        <Suspense fallback={<div className="forge-loading" role="status">COMPILING PROTOCOL FORGE…</div>}>
          <ProtocolForge
            key={`${forgeSession.mode}-${forgeSession.automation?.id ?? 'new'}`}
            apps={apps}
            handlers={handlers}
            preview={Boolean(previewData)}
            mode={forgeSession.mode}
            automation={forgeSession.automation}
            onClose={() => setForgeSession(null)}
            onSaved={refresh}
          />
        </Suspense>
      )}
    </div>
  );
}

/** Opened by clicking the core: the whole-system view rather than one agent. */
function CoreOverlay({
  apps,
  accounts,
  snapshots,
  automations,
  artifacts,
  onOpenForge,
  onClose,
}: {
  apps: App[];
  accounts: Account[];
  snapshots: AnalyticsSnapshot[];
  automations: Automation[];
  artifacts: MissionArtifact[];
  onOpenForge: () => void;
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
          <section className="brain-section">
            <h4>Three-mission authority</h4>
            <p>JARVIS is hard-locked to product promotion for Deadset, Cast and LifeScore. LifeScore remains dormant until release.</p>
            <div className="core-mission-list">
              {apps.map((app) => (
                <article key={app.id} style={{ '--mission-color': app.accent } as CSSProperties}>
                  <i /><div><b>{app.name}</b><small>{app.slug === 'lifescore' ? 'Release lock engaged' : `${automations.filter((automation) => automation.app_id === app.id && automation.enabled).length} internal stages online`}</small></div>
                  <strong>{artifacts.filter((artifact) => artifact.app_id === app.id && artifact.status === 'draft').length} REVIEW</strong>
                </article>
              ))}
            </div>
          </section>
          <button className="core-forge-action" type="button" onClick={() => { onClose(); onOpenForge(); }}>+ COMPILE A NEW PROTOCOL</button>
          <section className="brain-section">
            <h4>Learning signals</h4>
            <dl className="kv">
              <dt>Connected channels</dt><dd>{accounts.filter((account) => account.status === 'connected').length}/2 released apps</dd>
              <dt>Performance snapshots</dt><dd>{snapshots.length}</dd>
              <dt>Published proof set</dt><dd>{artifacts.filter((artifact) => artifact.status === 'published').length} posts</dd>
              <dt>Unrelated scheduled jobs</dt><dd>0</dd>
            </dl>
          </section>
        </div>
      </aside>
    </>
  );
}
