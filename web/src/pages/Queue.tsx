import { useState } from 'react';
import { api, supabase } from '../lib/supabase';
import { useData } from '../lib/useData';
import { Ago, Dot, Empty } from '../components/bits';
import type { Account, App, Artifact } from '../lib/types';

const FILTERS = ['draft', 'approved', 'publishing', 'published', 'failed', 'rejected'] as const;

/**
 * The review queue. Generation only ever produces drafts; nothing reaches
 * TikTok until it is approved here and has a video attached.
 */
export default function Queue() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('draft');
  const [error, setError] = useState<string | null>(null);

  const { data, refresh } = useData(async () => {
    const [artifacts, apps, accounts] = await Promise.all([
      supabase.from('artifacts').select('*').eq('status', filter)
        .order('created_at', { ascending: false }).limit(60),
      supabase.from('apps').select('*'),
      supabase.from('tiktok_accounts_public').select('*'),
    ]);
    if (artifacts.error) throw artifacts.error;
    return {
      artifacts: artifacts.data as Artifact[],
      apps: (apps.data ?? []) as App[],
      accounts: (accounts.data ?? []) as Account[],
    };
  }, [filter]);

  async function patch(id: string, body: Record<string, unknown>) {
    setError(null);
    try {
      await api(`/artifacts/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  if (!data) return <Empty>Loading…</Empty>;

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Review queue</h2>
          <p>Approved items need a video URL before the publisher will pick them up.</p>
        </div>
        <div className="row">
          {FILTERS.map((f) => (
            <button key={f} className={f === filter ? 'primary' : ''} onClick={() => setFilter(f)}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="card" style={{ color: 'var(--bad)', marginBottom: 14 }}>{error}</div>}

      <div className="grid">
        {data.artifacts.map((a) => {
          const app = data.apps.find((x) => x.id === a.app_id);
          return (
            <div className="card" key={a.id}>
              <div className="row between" style={{ marginBottom: 10 }}>
                <div className="row">
                  <Dot status={a.status} />
                  <strong>{a.hook ?? 'Untitled'}</strong>
                  {app && <span className="pill">{app.name}</span>}
                </div>
                <span className="muted"><Ago at={a.created_at} /></span>
              </div>

              <p style={{ margin: '0 0 10px', whiteSpace: 'pre-wrap' }}>{a.caption}</p>
              <p className="muted mono" style={{ margin: '0 0 12px' }}>
                {a.hashtags.map((t) => (t.startsWith('#') ? t : `#${t}`)).join(' ')}
              </p>

              {a.error && (
                <p className="mono" style={{ color: 'var(--bad)' }}>{a.error}</p>
              )}

              {(a.status === 'draft' || a.status === 'approved') && (
                <div className="grid" style={{ gridTemplateColumns: '1fr 200px', marginBottom: 12 }}>
                  <div className="field" style={{ margin: 0 }}>
                    <label>Video URL (must be on a domain verified with TikTok)</label>
                    <input
                      defaultValue={a.video_url ?? ''}
                      placeholder="https://…/video.mp4"
                      onBlur={(e) => {
                        const value = e.target.value.trim();
                        if (value !== (a.video_url ?? '')) patch(a.id, { video_url: value || null });
                      }}
                    />
                  </div>
                  <div className="field" style={{ margin: 0 }}>
                    <label>Account</label>
                    <select
                      defaultValue={a.account_id ?? ''}
                      onChange={(e) => patch(a.id, { account_id: e.target.value || null })}
                    >
                      <option value="">— pick one —</option>
                      {data.accounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>@{acc.handle}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <div className="row">
                {a.status === 'draft' && (
                  <button
                    className="primary"
                    disabled={!a.video_url || !a.account_id}
                    title={!a.video_url || !a.account_id ? 'Needs a video URL and an account' : undefined}
                    onClick={() => patch(a.id, { status: 'approved' })}
                  >
                    Approve
                  </button>
                )}
                {a.status === 'approved' && (
                  <button onClick={() => patch(a.id, { status: 'draft' })}>Unapprove</button>
                )}
                {(a.status === 'draft' || a.status === 'approved') && (
                  <button className="danger" onClick={() => patch(a.id, { status: 'rejected' })}>Reject</button>
                )}
                {(a.status === 'rejected' || a.status === 'failed') && (
                  <button onClick={() => patch(a.id, { status: 'draft' })}>Back to draft</button>
                )}
              </div>
            </div>
          );
        })}
        {data.artifacts.length === 0 && <div className="card"><Empty>Nothing {filter}.</Empty></div>}
      </div>
    </>
  );
}
