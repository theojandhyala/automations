import type { Account, AnalyticsSnapshot, App } from '../lib/types';

function fmt(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

/** Watch time in minutes -> a duration that reads as time, not distance. */
function fmtWatchTime(minutes: number | null | undefined): string {
  if (minutes == null) return '—';
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = minutes / 60;
  if (hours < 1000) return `${hours < 10 ? hours.toFixed(1) : Math.round(hours)} hrs`;
  return `${(hours / 1000).toFixed(1)}k hrs`;
}

function delta(current: number | null, previous: number | null): string | null {
  if (current == null || previous == null) return null;
  const d = current - previous;
  if (d === 0) return null;
  return `${d > 0 ? '+' : ''}${fmt(d)}`;
}

/**
 * One card per account, per workspace. When analytics has never run, or ran
 * without the scopes it needs, the card says so instead of rendering zeroes --
 * "no data yet" and "0 views" mean very different things.
 */
export default function AnalyticsCards({
  apps,
  accounts,
  snapshots,
}: {
  apps: App[];
  accounts: Account[];
  snapshots: AnalyticsSnapshot[];
}) {
  if (accounts.length === 0) {
    return (
      <div className="card">
        <p className="muted" style={{ margin: 0 }}>
          No TikTok accounts yet. Add one on the Accounts page to start collecting analytics.
        </p>
      </div>
    );
  }

  return (
    /* min(240px, 100%) keeps the tracks from outgrowing a narrow container --
       without it these cards overflow the agent-brain drawer and get clipped. */
    <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(240px, 100%), 1fr))' }}>
      {accounts.map((account) => {
        const app = apps.find((a) => a.id === account.app_id);
        const accent = app?.accent ?? '#6ea8fe';
        const mine = snapshots
          .filter((s) => s.account_id === account.id)
          .sort((a, b) => b.captured_at.localeCompare(a.captured_at));
        const latest = mine[0];
        const previous = mine[1];

        return (
          <div className="card" key={account.id} style={{ borderTop: `2px solid ${accent}`, minWidth: 0 }}>
            <div className="row between" style={{ marginBottom: 10 }}>
              <strong>@{account.handle}</strong>
              {app && <span className="pill" style={{ color: accent, borderColor: accent }}>{app.name}</span>}
            </div>

            {!latest ? (
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                No snapshot yet — enable the Analytics sync agent.
              </p>
            ) : (
              <>
                <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div className="stat">
                    <div className="label">Followers</div>
                    <div className="value" style={{ fontSize: 22 }}>{fmt(latest.followers)}</div>
                    {delta(latest.followers, previous?.followers ?? null) && (
                      <div className="muted" style={{ fontSize: 11 }}>
                        {delta(latest.followers, previous?.followers ?? null)} since last sync
                      </div>
                    )}
                  </div>
                  <div className="stat">
                    <div className="label">Views (recent)</div>
                    <div className="value" style={{ fontSize: 22 }}>{fmt(latest.views_28d)}</div>
                  </div>
                  <div className="stat">
                    <div className="label">Watch time</div>
                    <div className="value" style={{ fontSize: 22 }}>
                      {fmtWatchTime(latest.watch_time_min)}
                    </div>
                  </div>
                  <div className="stat">
                    <div className="label">Posts</div>
                    <div className="value" style={{ fontSize: 22 }}>{fmt(latest.video_count)}</div>
                  </div>
                </div>

                {latest.quality !== 'ok' && (
                  <p style={{ margin: '10px 0 0', fontSize: 11.5, color: '#fbbf24' }}>
                    {latest.quality === 'partial'
                      ? 'Partial data — reconnect this account with the user.info.stats and video.list scopes.'
                      : 'Analytics unavailable for this account.'}
                  </p>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
