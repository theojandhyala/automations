import type { Account, Automation } from '../lib/types';

function nextScheduled(automations: Automation[]): Automation | undefined {
  return automations
    .filter((automation) => automation.enabled && automation.next_run_at)
    .sort((a, b) => (a.next_run_at ?? '').localeCompare(b.next_run_at ?? ''))[0];
}

function formatTime(at: string | null): string {
  if (!at) return 'Manual';
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(at));
}

export default function JarvisBriefing({
  automations,
  accounts,
  drafts,
}: {
  automations: Automation[];
  accounts: Account[];
  drafts: number;
}) {
  const running = automations.filter((automation) => automation.status === 'running').length;
  const attention = automations.filter(
    (automation) => automation.status === 'failed' || automation.status === 'disabled',
  );
  const connected = accounts.filter((account) => account.status === 'connected').length;
  const next = nextScheduled(automations);

  const condition = attention.length
    ? { label: 'Attention required', tone: 'warn' }
    : running
      ? { label: 'Mission in progress', tone: 'active' }
      : { label: 'All systems nominal', tone: 'ok' };

  const recommendation = attention.length
    ? `Inspect ${attention[0].name}`
    : connected === 0
      ? 'Connect Deadset publishing'
      : drafts > 0
        ? `Review ${drafts} creation${drafts === 1 ? '' : 's'}`
        : next
          ? `${next.name} is standing by`
          : 'No mission is scheduled';

  return (
    <aside className="jarvis-brief" aria-label="JARVIS system briefing">
      <div className="jarvis-sigil" aria-hidden="true"><i /><b /><span /></div>
      <div className="jarvis-copy">
        <div className="jarvis-kicker">
          <span>JARVIS</span>
          <em>Local intelligence</em>
        </div>
        <strong className={`jarvis-condition ${condition.tone}`}>{condition.label}</strong>
        <p>{recommendation}</p>
        <div className="jarvis-telemetry">
          <span><b>{running}</b> active</span>
          <span><b>{connected}</b> linked</span>
          <span><b>{next ? formatTime(next.next_run_at) : '—'}</b> next</span>
        </div>
      </div>
    </aside>
  );
}
