export function Dot({ status }: { status: string }) {
  return <span className={`dot ${status}`} title={status} />;
}

export function Pill({ children }: { children: React.ReactNode }) {
  return <span className="pill">{children}</span>;
}

/** Compact relative time: "4m ago", "in 2h", "just now". */
export function Ago({ at }: { at: string | null }) {
  if (!at) return <span className="muted">—</span>;

  const deltaMs = Date.parse(at) - Date.now();
  const future = deltaMs > 0;
  let seconds = Math.abs(deltaMs) / 1000;

  if (seconds < 45) return <span title={at}>{future ? 'in a moment' : 'just now'}</span>;

  let label = 's';
  if (seconds >= 7 * 24 * 60 * 60) {
    seconds /= 7 * 24 * 60 * 60;
    label = 'w';
  } else if (seconds >= 24 * 60 * 60) {
    seconds /= 24 * 60 * 60;
    label = 'd';
  } else if (seconds >= 60 * 60) {
    seconds /= 60 * 60;
    label = 'h';
  } else if (seconds >= 60) {
    seconds /= 60;
    label = 'm';
  }
  const value = Math.round(seconds);
  return <span title={at}>{future ? `in ${value}${label}` : `${value}${label} ago`}</span>;
}

export function Duration({ ms }: { ms: number | null }) {
  if (ms == null) return <span className="muted">—</span>;
  if (ms < 1000) return <span>{ms}ms</span>;
  if (ms < 60_000) return <span>{(ms / 1000).toFixed(1)}s</span>;
  return <span>{Math.floor(ms / 60_000)}m {Math.round((ms % 60_000) / 1000)}s</span>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="empty">{children}</div>;
}
