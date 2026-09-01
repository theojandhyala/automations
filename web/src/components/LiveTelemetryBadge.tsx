import { useEffect, useState } from 'react';
import { useLiveSync } from '../lib/liveSync';

function ageLabel(at: string | null, now: number): string {
  if (!at) return 'LINKING';
  const seconds = Math.max(0, Math.floor((now - Date.parse(at)) / 1000));
  if (seconds < 3) return 'NOW';
  if (seconds < 60) return `${seconds}S`;
  return `${Math.floor(seconds / 60)}M`;
}

export default function LiveTelemetryBadge({ compact = false }: { compact?: boolean }) {
  const { status, lastEventAt, lastSource } = useLiveSync();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const stateLabel = status === 'live' ? 'LIVE' : status === 'fallback' ? 'POLLING' : 'LINKING';
  return (
    <span
      className={`live-telemetry-badge ${status} ${compact ? 'compact' : ''}`}
      role="status"
      title={lastSource ? `Last live update: ${lastSource}` : 'Connecting to the JARVIS live data bus'}
    >
      <i />
      <span>{compact ? 'DATA' : 'LIVE DATA'}</span>
      <b>{stateLabel}</b>
      {!compact ? <em>{ageLabel(lastEventAt, now)}</em> : null}
    </span>
  );
}
