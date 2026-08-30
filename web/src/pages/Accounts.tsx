import { useState } from 'react';
import { api, supabase } from '../lib/supabase';
import { useData } from '../lib/useData';
import { Ago, Dot, Empty } from '../components/bits';
import type { Account, App } from '../lib/types';

export default function Accounts() {
  const [handle, setHandle] = useState('');
  const [appId, setAppId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data, refresh } = useData(async () => {
    const [accounts, apps] = await Promise.all([
      supabase.from('tiktok_accounts_public').select('*').order('handle'),
      supabase.from('apps').select('*').order('name'),
    ]);
    return {
      accounts: (accounts.data ?? []) as Account[],
      apps: (apps.data ?? []) as App[],
    };
  }, [], 10000);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api('/tiktok/accounts', {
        method: 'POST',
        body: JSON.stringify({ handle, app_id: appId || null }),
      });
      setHandle('');
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function connect(id: string) {
    // Hands off to TikTok's consent screen; the Worker's callback stores the
    // tokens and redirects back here.
    const { url } = await api<{ url: string }>(`/tiktok/accounts/${id}/connect`);
    window.location.href = url;
  }

  if (!data) return <Empty>Loading…</Empty>;

  return (
    <>
      <div className="page-head">
        <div>
          <h2>TikTok accounts</h2>
          <p>Each account authorizes separately through TikTok's Content Posting API.</p>
        </div>
      </div>

      {error && <div className="card" style={{ color: 'var(--bad)', marginBottom: 14 }}>{error}</div>}

      <div className="card" style={{ padding: 0, marginBottom: 22 }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Handle</th><th>App</th><th>Token</th><th>Daily limit</th><th /></tr>
            </thead>
            <tbody>
              {data.accounts.map((a) => (
                <tr key={a.id}>
                  <td><div className="row"><Dot status={a.status} /> @{a.handle}</div></td>
                  <td className="muted">{data.apps.find((x) => x.id === a.app_id)?.name ?? '—'}</td>
                  <td>
                    {a.status === 'connected'
                      ? <>expires <Ago at={a.token_expires_at} /></>
                      : <span className="muted">{a.status}</span>}
                  </td>
                  <td>{a.daily_post_limit}/day</td>
                  <td style={{ textAlign: 'right' }}>
                    <button onClick={() => connect(a.id)}>
                      {a.status === 'connected' ? 'Reconnect' : 'Connect'}
                    </button>
                  </td>
                </tr>
              ))}
              {data.accounts.length === 0 && (
                <tr><td colSpan={5}><Empty>No accounts yet.</Empty></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <form onSubmit={add} className="row" style={{ alignItems: 'flex-end' }}>
          <div className="field" style={{ flex: 1, margin: 0 }}>
            <label>Handle</label>
            <input required value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@deadsetapp" />
          </div>
          <div className="field" style={{ width: 200, margin: 0 }}>
            <label>App</label>
            <select value={appId} onChange={(e) => setAppId(e.target.value)}>
              <option value="">—</option>
              {data.apps.map((app) => <option key={app.id} value={app.id}>{app.name}</option>)}
            </select>
          </div>
          <button className="primary" type="submit">Add account</button>
        </form>
      </div>
    </>
  );
}
