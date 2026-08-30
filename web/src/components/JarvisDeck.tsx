import type { CSSProperties } from 'react';
import { AgentIcon } from './icons';
import type { Account, App, Automation } from '../lib/types';

type AgentStyle = CSSProperties & { '--agent-color': string };

function agentState(automation: Automation): { label: string; tone: string } {
  if (!automation.enabled || automation.status === 'disabled') return { label: 'STANDBY', tone: 'sleeping' };
  if (automation.status === 'running') return { label: 'EXECUTING', tone: 'working' };
  if (automation.status === 'failed') return { label: 'FAULT', tone: 'failed' };
  return { label: 'READY', tone: 'ready' };
}

function nextTime(at: string | null): string {
  if (!at) return 'MANUAL';
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date(at));
}

export default function JarvisDeck({
  automations,
  apps,
  accounts,
  drafts,
  onOpenAgent,
  onOpenCore,
}: {
  automations: Automation[];
  apps: App[];
  accounts: Account[];
  drafts: number;
  onOpenAgent: (automation: Automation) => void;
  onOpenCore: () => void;
}) {
  const running = automations.filter((automation) => automation.status === 'running').length;
  const faults = automations.filter(
    (automation) => automation.status === 'failed' || automation.status === 'disabled',
  ).length;
  const connected = accounts.filter((account) => account.status === 'connected').length;
  const condition = faults ? 'ATTENTION REQUIRED' : running ? 'MISSION ACTIVE' : 'ALL SYSTEMS NOMINAL';

  return (
    <section className="jarvis-deck" aria-label="JARVIS agent control deck">
      <div className="deck-corner tl" aria-hidden="true" />
      <div className="deck-corner tr" aria-hidden="true" />
      <div className="deck-corner bl" aria-hidden="true" />
      <div className="deck-corner br" aria-hidden="true" />

      <button className="jarvis-kernel" type="button" onClick={onOpenCore} aria-label="Open the JARVIS control plane">
        <span className="kernel-reactor" aria-hidden="true">
          <i className="reactor-ring r1" />
          <i className="reactor-ring r2" />
          <i className="reactor-ring r3" />
          <i className="reactor-core" />
        </span>
        <span className="kernel-id">J.A.R.V.I.S.</span>
        <strong className={faults ? 'warn' : ''}>{condition}</strong>
        <span className="kernel-copy">
          Natural-language command authority<br />
          {automations.length} agent protocols linked
        </span>
        <span className="kernel-wave" aria-hidden="true">
          {Array.from({ length: 22 }, (_, index) => <i key={index} />)}
        </span>
        <span className="kernel-stats">
          <span><b>{running}</b> ACTIVE</span>
          <span><b>{connected}</b> LINKED</span>
          <span><b>{drafts}</b> REVIEW</span>
        </span>
        <span className="kernel-action">OPEN SYSTEM CORE</span>
      </button>

      <div className="agent-matrix" aria-label="Agent protocols">
        <div className="matrix-head">
          <span>AGENT PROTOCOL MATRIX</span>
          <span>{automations.filter((automation) => automation.enabled).length}/{automations.length} ONLINE</span>
        </div>
        <div className="matrix-grid">
          {automations.map((automation, index) => {
            const app = apps.find((candidate) => candidate.id === automation.app_id);
            const state = agentState(automation);
            const accent = automation.accent ?? app?.accent ?? '#63e7ff';
            return (
              <button
                type="button"
                className={`protocol-card ${state.tone}`}
                style={{ '--agent-color': accent } as AgentStyle}
                key={automation.id}
                onClick={() => onOpenAgent(automation)}
                aria-label={`${automation.name}: ${state.label}. Open agent controls.`}
              >
                <span className="protocol-index">A-{String(index + 1).padStart(2, '0')}</span>
                <span className="protocol-icon"><AgentIcon name={automation.icon} size={19} /></span>
                <span className="protocol-body">
                  <strong>{automation.name}</strong>
                  <small>{app?.name ?? 'SYSTEM'} // {automation.handler_key}</small>
                  <em>{automation.current_task ?? automation.description ?? 'Awaiting command'}</em>
                </span>
                <span className="protocol-meta">
                  <b>{state.label}</b>
                  <small>{nextTime(automation.next_run_at)}</small>
                </span>
                <span className="protocol-signal" aria-hidden="true"><i /><i /><i /><i /></span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
