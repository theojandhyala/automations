import type { CSSProperties } from 'react';
import { Ago } from './bits';
import type { App, Automation } from '../lib/types';

type ScheduleStyle = CSSProperties & { '--card-accent': string };

function primaryFor(app: App, automations: Automation[]): Automation | undefined {
  const appAutomations = automations.filter((automation) => automation.app_id === app.id);
  return appAutomations.find((automation) => automation.handler_key === 'tiktok.generate') ?? appAutomations[0];
}

export default function ScheduleStrip({ automations, apps, onOpenAgent }: {
  automations: Automation[];
  apps: App[];
  onOpenAgent: (automation: Automation) => void;
}) {
  const missions = apps.filter((app) => ['deadset', 'cast', 'lifescore'].includes(app.slug));

  return (
    <div className="schedule-strip mission-schedule" aria-label="Three app mission schedule">
      {missions.map((app, index) => {
        const primary = primaryFor(app, automations);
        const isStandby = app.slug === 'lifescore' || app.promotion_enabled === false;
        const status = isStandby ? 'Release standby' : primary?.status === 'running' ? 'Creating now' : primary?.enabled ? 'Autonomous' : 'Paused';
        return (
          <button
            key={app.id}
            className="sched-card"
            style={{ '--card-accent': app.accent } as ScheduleStyle}
            onClick={() => primary && onOpenAgent(primary)}
            disabled={!primary}
          >
            <span className="sched-index">0{index + 1}</span>
            <span className="when"><span>{!isStandby && primary?.next_run_at ? <Ago at={primary.next_run_at} /> : '—'}</span><span>{status}</span></span>
            <span className="what">{app.name.toUpperCase()} MISSION</span>
            <span className="note">{isStandby ? 'Locked until App Store release' : '3 posts/day · 12:00 → 15:00 → 18:00 UK'}</span>
          </button>
        );
      })}
    </div>
  );
}
