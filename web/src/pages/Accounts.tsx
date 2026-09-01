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
      api<{ developer_app_configured: boolean; provider: 'content_posting' | 'business_accounts'; production_provider: 'business_accounts'; redirect_uri: string | null; scopes: string[]; review_state: string; direct_post_test_ready: boolean; sandbox_private_only: boolean; public_direct_post_ready: boolean; autonomous_public_post_ready: boolean; owner_review_required: boolean }>('/tiktok/status'),
      api<{ apps: Array<{ id: string; slug: string; uploaded_feature_count: number; feature_count: number; photo_source_ready: boolean; drafting_ready: boolean; production_ready: boolean; publishing_ready: boolean; sandbox_publishing_ready: boolean; renderer_available: boolean }> }>('/promotion/readiness'),
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

  async function updateHandle(id: string, currentHandle: string, nextValue: string) {
    const nextHandle = nextValue.trim().replace(/^@/, '');
    if (!nextHandle || nextHandle === currentHandle) return;
    setError(null);
    try {
      await api(`/tiktok/accounts/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ handle: nextHandle }),
      });
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  if (!data) return <Empty>Loading…</Empty>;

  const castApp = data.apps.find((app) => app.slug === 'cast');
  const castAccount = data.accounts.find((account) => account.app_id === castApp?.id);
  const castReadiness = data.readiness.apps.find((app) => app.slug === 'cast');
  const businessMode = data.status.provider === 'business_accounts';
  const autonomousReady = data.status.autonomous_public_post_ready;
  const businessScopes = businessMode
    ? data.status.scopes
    : ['TikTok Accounts', 'Photo Publish', 'Publishing Status', 'Account & Media Insights'];
  const castSteps = [
    { label: 'Creative brain', detail: 'Cast truth playbook loaded', ready: Boolean(castReadiness?.drafting_ready) },
    { label: 'Product proof', detail: `${castReadiness?.uploaded_feature_count ?? 0}/${castReadiness?.feature_count ?? 6} exact Cast screens`, ready: Boolean(castReadiness && castReadiness.uploaded_feature_count === castReadiness.feature_count) },
    { label: 'Photo source', detail: 'Licensed lifestyle image feed', ready: Boolean(castReadiness?.photo_source_ready) },
    { label: 'Slide renderer', detail: castReadiness?.renderer_available ? 'Paid 1080×1920 JPEG renderer online' : 'Renderer unavailable', ready: Boolean(castReadiness?.production_ready) },
    { label: 'TikTok Business API', detail: autonomousReady ? 'Accounts API public automation approved' : businessMode ? 'Accounts API approval or credentials remain' : 'Switch from consumer sandbox to Accounts API', ready: autonomousReady },
    { label: 'TikTok channel', detail: castAccount ? `@${castAccount.handle} · ${castAccount.status}` : 'Add the Cast handle below', ready: autonomousReady && castAccount?.status === 'connected' },
  ];

  return (
    <div className="account-page ops-page jarvis-route">
      <div className="route-grid-plane" aria-hidden="true" />
      <div className="page-head account-head">
        <div>
          <p className="ops-eyebrow"><i /> J.A.R.V.I.S. // CHANNEL UPLINK</p>
          <h2>Channel uplink</h2>
          <p>Link each app to its exact TikTok identity. JARVIS checks the destination before anything enters the review bay.</p>
        </div>
        <div className="account-radar" aria-label={`${data.accounts.filter((account) => account.status === 'connected').length} linked channels`}>
          <div aria-hidden="true"><i /><i /><i /></div>
          <span>LINKED CHANNELS</span>
          <b>{data.accounts.filter((account) => account.status === 'connected').length}<small>/2</small></b>
        </div>
      </div>

      <section className="cast-uplink">
        <header><div><span>CAST LAUNCH SEQUENCE</span><h3>{castReadiness?.production_ready ? (castAccount?.status === 'connected' ? 'CAST CHANNEL ONLINE' : 'ONE HUMAN STEP REMAINS') : 'PRODUCTION SETUP REQUIRED'}</h3></div><b>{castSteps.filter((step) => step.ready).length}/{castSteps.length} READY</b></header>
        <div className="uplink-rail">
          {castSteps.map((step, index) => <article className={step.ready ? 'ready' : ''} key={step.label}><i>{String(index + 1).padStart(2, '0')}</i><div><b>{step.label}</b><small>{step.detail}</small></div><em>{step.ready ? 'ONLINE' : 'ACTION'}</em></article>)}
        </div>
        <footer>
          <p>Cast can draft complete, truth-locked carousels now. Public unattended delivery uses TikTok's Accounts API; JARVIS will not ask you to make the real account private.</p>
          {castAccount
            ? <button className="primary" disabled={!businessMode || !data.status.developer_app_configured} onClick={() => connect(castAccount.id)}>{!businessMode ? 'ACCOUNTS API ACCESS REQUIRED' : castAccount.status === 'connected' ? 'REAUTHORIZE CAST' : 'CONNECT CAST TO TIKTOK'}</button>
            : <button type="button" onClick={() => { if (castApp) setAppId(castApp.id); document.getElementById('account-handle')?.focus(); }}>ADD CAST CHANNEL</button>}
          <Link to="/promote?app=cast">OPEN CAST MISSION →</Link>
        </footer>
      </section>

      <section className="account-link-core">
        <div className={autonomousReady ? 'online' : ''}><span>PUBLIC AUTOMATION BRIDGE</span><b>{autonomousReady ? 'ONLINE' : businessMode ? `ACCOUNTS API ${data.status.review_state.toUpperCase()}` : 'ACCOUNTS API REQUIRED'}</b><small>{businessScopes.join(' · ')}</small></div>
        {data.apps.map((app) => {
          const account = data.accounts.find((item) => item.app_id === app.id);
          return <article key={app.id}><i className={autonomousReady && account?.status === 'connected' ? 'ready' : ''} /><div><span>{app.name.toUpperCase()} CHANNEL</span><b>{account ? `@${account.handle}` : 'NO ACCOUNT ADDED'}</b><small>{account?.status === 'connected' ? autonomousReady ? 'Owned Business Account authorised for public automation' : businessMode ? 'Reconnect after Accounts API approval is active' : 'Consumer login detected; Business Accounts authorisation still required' : 'Add the account below, then authorise it through TikTok Business'}</small></div></article>;
        })}
        <p>{autonomousReady ? 'Each owned account authorises once. Quality-passed posts can then publish publicly at 12:00, 15:00 and 18:00 Europe/London.' : 'Real accounts stay public. TikTok Business Accounts API approval and credentials are the remaining gate; the consumer Sandbox is test-only and is not the production route.'}</p>
      </section>

      {!autonomousReady && (
        <section className="production-review-action">
          <div><span>PUBLIC POSTING INTERLOCK</span><h3>TikTok Accounts API access is required</h3><p>This is TikTok's supported route for a brand to publish public photos and videos to its owned Business Accounts. The consumer Direct Post Sandbox will not be used on Deadset or Cast.</p></div>
          <ol><li><b>01</b> Complete Accounts API access form</li><li><b>02</b> Approve Photo Publish + Account User scopes</li><li><b>03</b> Install credentials and authorise both accounts</li></ol>
          <a href="https://business-api.tiktok.com/portal/apps" target="_blank" rel="noreferrer">OPEN TIKTOK BUSINESS APPS →</a>
        </section>
      )}

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
                  <td>
                    <div className="row">
                      <Dot status={a.status} />
                      <input
                        aria-label={`TikTok handle for ${data.apps.find((x) => x.id === a.app_id)?.name ?? 'account'}`}
                        className="mono"
                        defaultValue={`@${a.handle}`}
                        onBlur={(event) => updateHandle(a.id, a.handle, event.target.value)}
                        style={{ minWidth: 150 }}
                      />
                    </div>
                  </td>
                  <td className="muted">{data.apps.find((x) => x.id === a.app_id)?.name ?? '—'}</td>
                  <td>
                    {a.status === 'connected'
                      ? <>expires <Ago at={a.token_expires_at} /></>
                      : <span className="muted">{a.status}</span>}
                  </td>
                  <td>{a.daily_post_limit}/day</td>
                  <td style={{ textAlign: 'right' }}>
                    <button disabled={!businessMode || !data.status.developer_app_configured} onClick={() => connect(a.id)}>
                      {!businessMode ? 'Business setup required' : a.status === 'connected' ? 'Reconnect' : 'Connect'}
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
