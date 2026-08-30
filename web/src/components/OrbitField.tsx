import type { CSSProperties } from 'react';
import { AgentIcon } from './icons';
import type { App, Automation } from '../lib/types';

/** Ring radii as a fraction of the field's half-width. */
const RING_RADIUS: Record<number, number> = { 1: 0.72, 2: 0.94 };

export interface AgentPlacement {
  automation: Automation;
  /** Percent coordinates within the field, 0..100. */
  x: number;
  y: number;
  ring: number;
  accent: string;
}

/**
 * Lays agents out around the core. An agent's angle comes from its
 * orbit_position (0..1 clockwise from the top); agents without one are spread
 * evenly across the gaps so a freshly created automation still lands somewhere
 * sensible rather than stacking on top of another.
 */
export function placeAgents(automations: Automation[], apps: App[]): AgentPlacement[] {
  const unplaced = automations.filter((a) => a.orbit_position == null);
  let nextAuto = 0;

  return automations.map((automation) => {
    const ring = automation.orbit_ring ?? 1;
    const position =
      automation.orbit_position ?? (unplaced.length ? (nextAuto++ + 0.5) / unplaced.length : 0);

    const angle = position * Math.PI * 2 - Math.PI / 2;
    const radius = (RING_RADIUS[ring] ?? RING_RADIUS[1]!) * 50;

    const app = apps.find((p) => p.id === automation.app_id);
    return {
      automation,
      ring,
      x: 50 + Math.cos(angle) * radius,
      y: 50 + Math.sin(angle) * radius,
      accent: automation.accent ?? app?.accent ?? '#6ea8fe',
    };
  });
}

/** IDLE / WORKING / FAILED / PAUSED, as shown under each badge. */
function stateLabel(a: Automation): string {
  if (a.status === 'running') return 'Working';
  if (a.status === 'failed') return 'Failed';
  if (a.status === 'disabled' || !a.enabled) return 'Sleeping';
  return 'Online';
}

type AgentStyle = CSSProperties & {
  '--agent-color': string;
  '--agent-delay': string;
  '--agent-index': number;
};

function AgentNode({
  placement,
  app,
  onOpen,
}: {
  placement: AgentPlacement;
  app: App | undefined;
  onOpen: () => void;
}) {
  const { automation: a, accent } = placement;
  const state = a.status === 'idle' && !a.enabled ? 'disabled' : a.status;

  return (
    <button
      type="button"
      className={`agent ring-${placement.ring}`}
      data-state={state}
      style={{
        left: `${placement.x}%`,
        top: `${placement.y}%`,
        color: accent,
        '--agent-color': accent,
        '--agent-delay': `${((placement.x + placement.y) % 7) * -0.35}s`,
        '--agent-index': Math.round(placement.x + placement.y),
      } as AgentStyle}
      onClick={onOpen}
      aria-label={`${a.name} — ${stateLabel(a)}. Open agent brain.`}
    >
      <span className="agent-aura" aria-hidden="true" />
      <span className="hex-shell">
        <span className="hex">
          <span className="gem-core" aria-hidden="true" />
          <AgentIcon name={a.icon} size={23} />
        </span>
      </span>
      <span className="agent-name">{a.name}</span>
      <span className="agent-state">{stateLabel(a)}</span>
      {app && (
        <span className="agent-workspace" style={{ color: accent }}>
          {app.name}
        </span>
      )}
      {a.status === 'running' && a.current_task && (
        <span className="agent-task">{a.current_task}</span>
      )}
    </button>
  );
}

export default function OrbitField({
  automations,
  apps,
  workingCount,
  onOpenAgent,
  onOpenCore,
}: {
  automations: Automation[];
  apps: App[];
  workingCount: number;
  onOpenAgent: (a: Automation) => void;
  onOpenCore: () => void;
}) {
  const placements = placeAgents(automations, apps);

  return (
    <div className="orbit-field">
      <div className="scanner-beam" aria-hidden="true" />
      <div className="core-energy-field" aria-hidden="true" />
      <svg className="rings" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <defs>
          <radialGradient id="coreGlow">
            <stop offset="0%" stopColor="#5eead4" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#5eead4" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="radarLine" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#67e8f9" stopOpacity="0" />
            <stop offset="52%" stopColor="#67e8f9" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
          </linearGradient>
        </defs>

        <circle cx="50" cy="50" r="34" fill="url(#coreGlow)" />

        <g className="radar-axis">
          <line x1="50" y1="3" x2="50" y2="97" stroke="url(#radarLine)" strokeWidth="0.12" />
          <line x1="3" y1="50" x2="97" y2="50" stroke="url(#radarLine)" strokeWidth="0.12" />
          <line x1="17" y1="17" x2="83" y2="83" stroke="url(#radarLine)" strokeWidth="0.1" />
          <line x1="83" y1="17" x2="17" y2="83" stroke="url(#radarLine)" strokeWidth="0.1" />
        </g>

        {[13, 22, 31].map((radius) => (
          <circle key={radius} cx="50" cy="50" r={radius} fill="none"
                  stroke="rgba(125,211,252,0.12)" strokeWidth="0.13" />
        ))}

        {/* Orbit paths, drifting in opposite directions. */}
        <g className="ring-spin-a">
          <circle cx="50" cy="50" r={RING_RADIUS[1]! * 50} fill="none"
                  stroke="rgba(94,234,212,0.18)" strokeWidth="0.22" strokeDasharray="1.2 2.4" />
        </g>
        <g className="ring-spin-b">
          <circle cx="50" cy="50" r={RING_RADIUS[2]! * 50} fill="none"
                  stroke="rgba(99,102,241,0.16)" strokeWidth="0.22" strokeDasharray="0.7 3.2" />
        </g>
        <circle cx="50" cy="50" r={RING_RADIUS[1]! * 50 - 8} fill="none"
                stroke="rgba(148,163,184,0.13)" strokeWidth="0.14" strokeDasharray="0.3 1.7" />

        {/* Connector lines core -> agent, with a pulse riding each one. A
            working agent's connector is brighter and its pulse faster. */}
        {placements.map(({ automation: a, x, y, accent }) => {
          const working = a.status === 'running';
          const path = `M 50 50 L ${x} ${y}`;
          return (
            <g key={a.id}>
              <line
                x1="50" y1="50" x2={x} y2={y}
                stroke={working ? accent : a.enabled ? accent : 'rgba(148,163,184,0.24)'}
                strokeWidth={working ? 0.34 : 0.14}
                opacity={a.enabled ? 0.44 : 0.3}
              />
              {a.enabled && (
                <circle
                  className="pulse"
                  r={working ? 0.75 : 0.45}
                  fill={working ? accent : 'rgba(148,163,184,0.6)'}
                  style={{
                    offsetPath: `path("${path}")`,
                    animationDuration: working ? '1.5s' : '3.4s',
                    animationDelay: `${(x + y) % 3}s`,
                  }}
                />
              )}
            </g>
          );
        })}
      </svg>

      <button type="button" className="core" onClick={onOpenCore}
              aria-label="Open the control plane summary">
        <span className="core-orb"><i /><i /><i /></span>
        <span className="core-halo" />
        <span className="core-halo b" />
        <span className="core-halo c" />
        <span className="core-label">
          <span className="n">JARVIS</span>
          <span className="c">{automations.length}</span>
          <span className="s">
            {workingCount > 0 ? `${workingCount} working` : 'agents linked'}
          </span>
        </span>
      </button>

      {/* Below the mobile breakpoint the absolute positions are overridden and
          this becomes a plain grid. */}
      <div className="agent-grid">
        {placements.map((placement) => (
          <AgentNode
            key={placement.automation.id}
            placement={placement}
            app={apps.find((p) => p.id === placement.automation.app_id)}
            onOpen={() => onOpenAgent(placement.automation)}
          />
        ))}
      </div>
    </div>
  );
}
