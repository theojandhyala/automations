import type { CSSProperties } from 'react';
import type { Account, App, Automation } from '../lib/types';

type MissionStyle = CSSProperties & { '--mission-color': string; '--mission-index': number };

export interface MissionArtifact {
  app_id: string | null;
  status: string;
  created_at?: string;
}

export interface MissionReadiness {
  slug: string;
  uploaded_feature_count: number;
  feature_count: number;
  drafting_ready: boolean;
  production_ready: boolean;
  publishing_ready: boolean;
  sandbox_publishing_ready?: boolean;
  blockers: string[];
}

function nextMissionAt(automations: Automation[]): string | null {
  let earliest: string | null = null;
  for (const automation of automations) {
    if (!automation.enabled || !automation.next_run_at) continue;
    if (!earliest || automation.next_run_at < earliest) earliest = automation.next_run_at;
  }
  return earliest;
}

function formatLaunch(at: string | null): string {
  if (!at) return 'AWAITING COMMAND';
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short', hour: '2-digit', minute: '2-digit',
  }).format(new Date(at)).toUpperCase();
}

export default function JarvisDeck({
  automations,
  apps,
  accounts,
  artifacts,
  readiness,
  onOpenAgent,
  onOpenCore,
}: {
  automations: Automation[];
  apps: App[];
  accounts: Account[];
  artifacts: MissionArtifact[];
  readiness: MissionReadiness[];
  onOpenAgent: (automation: Automation) => void;
  onOpenCore: () => void;
}) {
  const missions = apps
    .filter((app) => ['deadset', 'cast', 'lifescore'].includes(app.slug))
    .sort((a, b) => a.sort_order - b.sort_order);
  const running = automations.filter((automation) => automation.status === 'running').length;
  const connected = accounts.filter((account) => account.status === 'connected').length;
  const review = artifacts.filter((artifact) => artifact.status === 'draft').length;

  return (
    <section className="jarvis-deck focused-deck" aria-label="Three-app JARVIS mission control">
      <div className="deck-corner tl" aria-hidden="true" />
      <div className="deck-corner tr" aria-hidden="true" />
      <div className="deck-corner bl" aria-hidden="true" />
      <div className="deck-corner br" aria-hidden="true" />

      <button className="jarvis-kernel mission-kernel" type="button" onClick={onOpenCore} aria-label="Open the JARVIS mission core">
        <span className="kernel-coordinate top">OWNER COMMAND // THREE-MISSION LOCK</span>
        <span className="kernel-coordinate side">ARC CORE // MARK 03</span>
        <span className="kernel-reactor" aria-hidden="true">
          <i className="reactor-tick tick-a" /><i className="reactor-tick tick-b" /><i className="reactor-tick tick-c" />
          <i className="reactor-ring r1" /><i className="reactor-ring r2" /><i className="reactor-ring r3" />
          <i className="reactor-triangle" /><i className="reactor-core" /><i className="reactor-scan" />
        </span>
        <span className="kernel-id">J.A.R.V.I.S.</span>
        <strong>{running ? 'MISSION EXECUTING' : 'POSTING CORE ONLINE'}</strong>
        <span className="kernel-copy">Deadset · Cast · LifeScore<br />No unrelated automation branches</span>
        <span className="kernel-wave" aria-hidden="true">
          {Array.from({ length: 22 }, (_, index) => <i key={index} />)}
        </span>
        <span className="kernel-stats">
          <span><b>{running}</b> ACTIVE</span><span><b>{connected}</b> LINKED</span><span><b>{review}</b> REVIEW</span>
        </span>
        <span className="kernel-action">OPEN MISSION CORE</span>
      </button>

      <div className="mission-array" aria-label="App posting missions">
        <div className="matrix-head"><span>APP MISSION ARRAY</span><span>3 CHANNELS // HARD LOCK</span></div>
        <div className="mission-grid">
          {missions.map((app, index) => {
            const appAutomations = automations.filter((automation) => automation.app_id === app.id);
            const primary = appAutomations.find((automation) => automation.handler_key === 'tiktok.generate') ?? appAutomations[0];
            const account = accounts.find((candidate) => candidate.app_id === app.id);
            const appArtifacts = artifacts.filter((artifact) => artifact.app_id === app.id);
            const appReadiness = readiness.find((candidate) => candidate.slug === app.slug);
            const isStandby = app.slug === 'lifescore' || app.promotion_enabled === false;
            const isRunning = appAutomations.some((automation) => automation.status === 'running');
            const deliveryBlocked = !isStandby && !appReadiness?.publishing_ready;
            const hasFault = appAutomations.some((automation) => automation.status === 'failed') || Boolean(account && account.status !== 'connected') || deliveryBlocked;
            const status = isStandby ? 'LOCKED UNTIL RELEASE' : isRunning ? 'EXECUTING' : hasFault ? 'ATTENTION' : 'MISSION READY';
            const nextAt = nextMissionAt(appAutomations);
            const featureTotal = appReadiness?.feature_count ?? 0;
            const featureReady = appReadiness?.uploaded_feature_count ?? 0;
            const drafts = appArtifacts.filter((artifact) => artifact.status === 'draft').length;
            const approved = appArtifacts.filter((artifact) => ['approved', 'publishing'].includes(artifact.status)).length;
            const published = appArtifacts.filter((artifact) => artifact.status === 'published').length;
            const accent = app.accent || ['#ff4f3e', '#48c9ff', '#ffc861'][index] || '#63e7ff';

            return (
              <button
                className={`app-mission ${isStandby ? 'standby' : ''} ${hasFault ? 'attention' : ''}`}
                style={{ '--mission-color': accent, '--mission-index': index } as MissionStyle}
                type="button"
                key={app.id}
                disabled={!primary}
                onClick={() => primary && onOpenAgent(primary)}
              >
                <span className="mission-number">0{index + 1}</span>
                <span className="mission-orb" aria-hidden="true"><i /><i /><i /><b /></span>
                <span className="mission-copy"><small>{isStandby ? 'FUTURE CHANNEL' : 'AUTONOMOUS POSTING CHANNEL'}</small><strong>{app.name}</strong><em>{app.tagline ?? 'Product promotion intelligence'}</em></span>
                <span className="mission-state"><i />{status}</span>
                <span className="mission-data-grid">
                  <span><small>OUTPUT</small><b>{isStandby ? 'OFF' : `${account?.daily_post_limit ?? 3}/DAY`}</b></span>
                  <span><small>DRAFTS</small><b>{drafts}</b></span>
                  <span><small>READY</small><b>{approved}</b></span>
                  <span><small>SHIPPED</small><b>{published}</b></span>
                  <span><small>FEATURE PROOF</small><b>{featureTotal ? `${featureReady}/${featureTotal}` : isStandby ? 'LOCKED' : '—'}</b></span>
                  <span><small>TIKTOK ACCESS</small><b>{isStandby ? 'WAITING' : appReadiness?.publishing_ready ? 'PUBLIC AUTO' : account?.status === 'connected' ? 'BUSINESS REVIEW' : 'ACTION'}</b></span>
                </span>
                <span className="mission-window"><small>{isStandby ? 'NEXT INTELLIGENCE CYCLE' : 'POSTING WINDOWS // UK'}</small><b>{isStandby ? 'AFTER APP STORE RELEASE' : '12:00 · 15:00 · 18:00'}</b>{!isStandby && <em>Next content build {formatLaunch(nextAt)}</em>}</span>
                <span className="mission-pipeline" aria-hidden="true">
                  {['IDEA', 'PROOF', 'RENDER', 'REVIEW', 'POST'].map((stage, stageIndex) => <i key={stage} data-stage={stage} className={isStandby ? '' : stageIndex < 3 ? 'live' : ''} />)}
                </span>
                <span className="mission-scan" aria-hidden="true" />
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
