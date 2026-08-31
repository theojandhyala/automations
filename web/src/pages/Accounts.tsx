import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, supabase } from '../lib/supabase';
import { useData } from '../lib/useData';
import { Ago, Dot, Empty } from '../components/bits';
import type { Account, App } from '../lib/types';

export default function Accounts() {
  const [searchParams] = useSearchParams();
  const [handle, setHandle] = useState('');
  const [appId, setAppId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data, refresh } = useData(async () => {
    const [accounts, apps, status, readiness] = await Promise.all([
      supabase.from('tiktok_accounts_public').select('*').order('handle'),
      supabase.from('apps').select('*').eq('promotion_enabled', true).order('name'),
      api<{ developer_app_configured: boolean; redirect_uri: string | null; scopes: string[]; owner_review_required: boolean }>('/tiktok/status'),
      api<{ apps: Array<{ id: string; slug: string; uploaded_feature_count: number; feature_count: number; photo_source_ready: boolean; drafting_ready: boolean; production_ready: boolean; publishing_ready: boolean; renderer_available: boolean }> }>('/promotion/readiness'),
    ]);
    return {
      accounts: (accounts.data ?? []) as Account[],
      apps: (apps.data ?? []) as App[],
      status,
      readiness,
    };
  }, [], 10000);

  useEffect(() => {
    if (!data || appId) return;
    const requested = searchParams.get('app');
    const preferred = data.apps.find((app) => app.slug === requested)
      ?? data.apps.find((app) => app.slug === 'cast')
      ?? data.apps[0];
    if (preferred) setAppId(preferred.id);
  }, [appId, data, searchParams]);

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

  const castApp = data.apps.find((app) => app.slug === 'cast');
  const castAccount = data.accounts.find((account) => account.app_id === castApp?.id);
  const castReadiness = data.readiness.apps.find((app) => app.slug === 'cast');
  const castSteps = [
    { label: 'Creative brain', detail: 'Cast truth playbook loaded', ready: Boolean(castReadiness?.drafting_ready) },
    { label: 'Product proof', detail: `${castReadiness?.uploaded_feature_count ?? 0}/${castReadiness?.feature_count ?? 6} exact Cast screens`, ready: Boolean(castReadiness && castReadiness.uploaded_feature_count === castReadiness.feature_count) },
    { label: 'Photo source', detail: 'Licensed lifestyle image feed', ready: Boolean(castReadiness?.photo_source_ready) },
    { label: 'Slide renderer', detail: castReadiness?.renderer_available ? 'Reusable 1080×1920 JPEG session online' : 'Renderer unavailable', ready: Boolean(castReadiness?.production_ready) },
    { label: 'TikTok channel', detail: castAccount ? `@${castAccount.handle} · ${castAccount.status}` : 'Add the Cast handle below', ready: castAccount?.status === 'connected' },
  ];

  return (
    <div className="account-page ops-page">
      <div className="ops-grid-plane" aria-hidden="true" />
      <div className="page-head account-head">
        <div>
          <p className="ops-eyebrow"><i /> J.A.R.V.I.S. // CHANNEL UPLINK</p>
          <h2>TikTok accounts</h2>
          <p>Connect Cast and Deadset once, then every approved mission can be routed to the right channel.</p>
        </div>
      </div>

      <section className="cast-uplink">
        <header><div><span>CAST LAUNCH SEQUENCE</span><h3>{castReadiness?.production_ready ? (castAccount?.status === 'connected' ? 'CAST CHANNEL ONLINE' : 'ONE HUMAN STEP REMAINS') : 'PRODUCTION SETUP REQUIRED'}</h3></div><b>{castSteps.filter((step) => step.ready).length}/{castSteps.length} READY</b></header>
        <div className="uplink-rail">
          {castSteps.map((step, index) => <article className={step.ready ? 'ready' : ''} key={step.label}><i>{String(index + 1).padStart(2, '0')}</i><div><b>{step.label}</b><small>{step.detail}</small></div><em>{step.ready ? 'ONLINE' : 'ACTION'}</em></article>)}
        </div>
        <footer>
          <p>Cast can draft complete, truth-locked carousels now. One reusable Cloudflare browser session renders both final slides inside the included free allowance. TikTok still requires your consent before delivery.</p>
          {castAccount
            ? <button className="primary" disabled={!data.status.developer_app_configured} onClick={() => connect(castAccount.id)}>{castAccount.status === 'connected' ? 'REAUTHORIZE CAST' : 'CONNECT CAST TO TIKTOK'}</button>
            : <button type="button" onClick={() => { if (castApp) setAppId(castApp.id); document.getElementById('account-handle')?.focus(); }}>ADD CAST CHANNEL</button>}
          <Link to="/promote?app=cast">OPEN CAST MISSION →</Link>
        </footer>
      </section>

      <section className="account-link-core">
        <div className={data.status.developer_app_configured ? 'online' : ''}><span>DEVELOPER BRIDGE</span><b>{data.status.developer_app_configured ? 'ONLINE' : 'SETUP REQUIRED'}</b><small>{data.status.scopes.join(' · ')}</small></div>
        {data.apps.map((app) => {
          const account = data.accounts.find((item) => item.app_id === app.id);
          return <article key={app.id}><i className={account?.status === 'connected' ? 'ready' : ''} /><div><span>{app.name.toUpperCase()} CHANNEL</span><b>{account ? `@${account.handle}` : 'NO ACCOUNT ADDED'}</b><small>{account?.status === 'connected' ? 'OAuth publishing link verified' : 'Add the account below, then complete TikTok consent'}</small></div></article>;
        })}
        <p>Every account authorizes separately. Drafts cannot publish until you approve the exact media, caption, privacy and disclosure.</p>
      </section>

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
                    <button disabled={!data.status.developer_app_configured} onClick={() => connect(a.id)}>
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
        <form onSubmit={add} className="account-add-form">
          <div className="account-form-copy"><span>NEW CHANNEL</span><b>Add the exact TikTok handle</b><small>No password is stored here. TikTok handles the account sign-in and consent.</small></div>
          <div className="field">
            <label>Handle</label>
            <input id="account-handle" required value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@cast" />
          </div>
          <div className="field">
            <label>App</label>
            <select required value={appId} onChange={(e) => setAppId(e.target.value)}>
              <option value="">Choose Deadset or Cast</option>
              {data.apps.map((app) => <option key={app.id} value={app.id}>{app.name}</option>)}
            </select>
          </div>
          <button className="primary" type="submit">Add account</button>
        </form>
      </div>
    </div>
  );
}
