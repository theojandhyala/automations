import type { CSSProperties } from 'react';
import { AgentIcon } from './icons';
import { Ago } from './bits';
import type { App, Automation } from '../lib/types';

/**
 * Today's four key actions. Picks the daily-cadence agents that actually
 * produce something -- drafting, publishing, analytics, the morning report --
 * and shows when each next fires. Falls back to whatever is scheduled soonest
 * if those are not enabled.
 */
const PRIORITY = ['tiktok.generate', 'tiktok.publish', 'analytics.sync', 'report.daily'];

function pickFour(automations: Automation[]): Automation[] {
  const chosen: Automation[] = [];

  for (const key of PRIORITY) {
    const match = automations
      .filter((a) => a.handler_key === key)
      .sort((a, b) => {
        // Enabled first, then whichever runs soonest.
        if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
        return (a.next_run_at ?? '9999').localeCompare(b.next_run_at ?? '9999');
      })[0];
    if (match) chosen.push(match);
  }

  for (const a of automations) {
    if (chosen.length >= 4) break;
    if (!chosen.some((c) => c.id === a.id)) chosen.push(a);
  }

  return chosen.slice(0, 4);
}

export default function ScheduleStrip({
  automations,
  apps,
  onOpenAgent,
}: {
  automations: Automation[];
  apps: App[];
  onOpenAgent: (a: Automation) => void;
}) {
  const cards = pickFour(automations);

  return (
    <div className="schedule-strip">
      {cards.map((a, index) => {
        const app = apps.find((p) => p.id === a.app_id);
        const accent = a.accent ?? app?.accent ?? '#6ea8fe';
        const status = !a.enabled
          ? 'Paused'
          : a.status === 'running'
            ? 'Working'
            : a.status === 'failed'
              ? 'Failed'
              : 'Scheduled';

        return (
          <button
            key={a.id}
            className="sched-card"
            style={{ '--card-accent': accent } as CSSProperties}
            onClick={() => onOpenAgent(a)}
          >
            <span className="sched-index">0{index + 1}</span>
            <span className="when">
              <span>{a.enabled && a.next_run_at ? <Ago at={a.next_run_at} /> : '—'}</span>
              <span
                style={{
                  color:
                    status === 'Working' ? '#34d399'
                      : status === 'Failed' ? '#fb7185'
                      : status === 'Paused' ? '#64748b'
                      : accent,
                }}
              >
                {status}
              </span>
            </span>
            <span className="what" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: accent, display: 'inline-flex', flex: '0 0 auto' }}>
                <AgentIcon name={a.icon} size={14} />
              </span>
              {a.name}
            </span>
            <span className="note">
              {a.status === 'running' && a.current_task
                ? a.current_task
                : a.cron
                  ? `cron ${a.cron} UTC`
                  : 'manual only'}
            </span>
          </button>
        );
      })}
    </div>
  );
}
