import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/supabase';

interface AppleRequest {
  id: string;
  status: 'pending_confirmation' | 'creating' | 'succeeded' | 'failed';
  app_name: string;
  subscription_name: string;
  offer_name: string;
  custom_code: string;
  redemption_limit: number;
  expiration_date: string | null;
  redemption_url: string | null;
  error: string | null;
  created_at: string;
}

interface AppleApp { id: string; name: string; bundle_id: string }
interface AppleSubscription { id: string; name: string; product_id: string; state: string }
interface AppleOffer { id: string; name: string; active: boolean; duration: string; mode: string; periods: number }

const CAPABILITIES: ReadonlyArray<{
  icon: string;
  title: string;
  copy: string;
  state: string;
  tone: string;
  href?: string;
}> = [
  { icon: '✦', title: 'Promotion mission', copy: 'Choose an app and outcome, then draft or produce native TikTok creative through one guided flow.', state: 'LIVE', tone: 'live', href: '/promote' },
  { icon: '◈', title: 'Apple offer codes', copy: 'Create confirmed, auditable subscription discount codes from anywhere.', state: 'LIVE', tone: 'live', href: '#apple-codes' },
  { icon: '▤', title: 'Content production', copy: 'Build licensed-photo Deadset carousels with the exact app feature screens.', state: 'LIVE', tone: 'live', href: '/studio' },
  { icon: '⌁', title: 'Review & publish', copy: 'Inspect drafts, set TikTok disclosure controls, approve and schedule posts.', state: 'LIVE', tone: 'live', href: '/queue' },
  { icon: '◎', title: 'Agent control', copy: 'Run, pause, schedule and inspect every linked automation protocol.', state: 'LIVE', tone: 'live', href: '/overview' },
  { icon: '⌁', title: 'Account links', copy: 'Connect TikTok accounts and check the actual publishing permissions.', state: 'LIVE', tone: 'live', href: '/accounts' },
  { icon: '⌗', title: 'Daily intelligence', copy: 'Open performance reports, faults, blockers and recent system activity.', state: 'LIVE', tone: 'live', href: '/reports' },
  { icon: '△', title: 'TestFlight releases', copy: 'Select a build, assign groups and notify testers after Apple is connected.', state: 'NEXT', tone: 'next' },
  { icon: '◇', title: 'App Store reviews', copy: 'Read new reviews and prepare owner-approved responses from this console.', state: 'NEXT', tone: 'next' },
  { icon: '⌁', title: 'Email missions', copy: 'Send approved launch, code and support emails after a mail provider is connected.', state: 'CONNECT', tone: 'connect' },
  { icon: '⬡', title: 'Deployment control', copy: 'Deploying app code still needs a build and release; it cannot bypass Apple review.', state: 'RELEASE REQUIRED', tone: 'locked' },
];

export default function RemoteOperations() {
  const [status, setStatus] = useState<{ configured: boolean; requests: AppleRequest[] } | null>(null);
  const [apps, setApps] = useState<AppleApp[]>([]);
  const [subscriptions, setSubscriptions] = useState<AppleSubscription[]>([]);
  const [offers, setOffers] = useState<AppleOffer[]>([]);
  const [appleAppId, setAppleAppId] = useState('');
  const [subscriptionId, setSubscriptionId] = useState('');
  const [offerId, setOfferId] = useState('');
  const [customCode, setCustomCode] = useState('');
  const [redemptionLimit, setRedemptionLimit] = useState(1);
  const [expirationDate, setExpirationDate] = useState('');
  const [issuerId, setIssuerId] = useState('');
  const [keyId, setKeyId] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [showCredentials, setShowCredentials] = useState(false);
  const [pending, setPending] = useState<AppleRequest | null>(null);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);

  const refreshStatus = useCallback(async () => {
    setStatus(await api('/app-store/status'));
  }, []);

  const loadApps = useCallback(async () => {
    setBusy('catalog');
    try {
      const result = await api<{ apps: AppleApp[] }>('/app-store/catalog');
      setApps(result.apps);
    } catch (error) {
      setMessage({ tone: 'bad', text: error instanceof Error ? error.message : 'Could not load Apple apps.' });
    } finally {
      setBusy('');
    }
  }, []);

  useEffect(() => {
    refreshStatus().catch((error) => setMessage({ tone: 'bad', text: error.message }));
  }, [refreshStatus]);

  useEffect(() => {
    if (status?.configured && apps.length === 0) loadApps();
  }, [status?.configured, apps.length, loadApps]);

  const selectedApp = useMemo(() => apps.find((item) => item.id === appleAppId), [apps, appleAppId]);
  const selectedSubscription = useMemo(
    () => subscriptions.find((item) => item.id === subscriptionId),
    [subscriptions, subscriptionId],
  );
  const selectedOffer = useMemo(() => offers.find((item) => item.id === offerId), [offers, offerId]);

  async function connectApple(event: React.FormEvent) {
    event.preventDefault();
    setBusy('credentials');
    setMessage(null);
    try {
      const result = await api<{ app_count: number }>('/integrations/app-store', {
        method: 'PUT',
        body: JSON.stringify({ issuer_id: issuerId, key_id: keyId, private_key: privateKey }),
      });
      setMessage({ tone: 'ok', text: `App Store Connect verified. ${result.app_count} app(s) visible.` });
      setPrivateKey('');
      setShowCredentials(false);
      await refreshStatus();
      await loadApps();
    } catch (error) {
      setMessage({ tone: 'bad', text: error instanceof Error ? error.message : 'Apple connection failed.' });
    } finally {
      setBusy('');
    }
  }

  async function chooseApp(id: string) {
    setAppleAppId(id);
    setSubscriptionId('');
    setOfferId('');
    setSubscriptions([]);
    setOffers([]);
    if (!id) return;
    setBusy('subscriptions');
    try {
      const result = await api<{ subscriptions: AppleSubscription[] }>(`/app-store/catalog?app_id=${encodeURIComponent(id)}`);
      setSubscriptions(result.subscriptions);
    } catch (error) {
      setMessage({ tone: 'bad', text: error instanceof Error ? error.message : 'Could not load subscriptions.' });
    } finally {
      setBusy('');
    }
  }

  async function chooseSubscription(id: string) {
    setSubscriptionId(id);
    setOfferId('');
    setOffers([]);
    if (!id) return;
    setBusy('offers');
    try {
      const result = await api<{ offers: AppleOffer[] }>(`/app-store/catalog?subscription_id=${encodeURIComponent(id)}`);
      setOffers(result.offers.filter((offer) => offer.active));
    } catch (error) {
      setMessage({ tone: 'bad', text: error instanceof Error ? error.message : 'Could not load offers.' });
    } finally {
      setBusy('');
    }
  }

  async function previewCode(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedApp || !selectedSubscription || !selectedOffer) return;
    setBusy('preview');
    setMessage(null);
    try {
      const request = await api<AppleRequest>('/app-store/custom-codes/preview', {
        method: 'POST',
        body: JSON.stringify({
          apple_app_id: selectedApp.id,
          app_name: selectedApp.name,
          subscription_id: selectedSubscription.id,
          subscription_name: selectedSubscription.name,
          offer_code_id: selectedOffer.id,
          offer_name: selectedOffer.name,
          custom_code: customCode,
          redemption_limit: redemptionLimit,
          expiration_date: expirationDate || null,
        }),
      });
      setPending(request);
      await refreshStatus();
    } catch (error) {
      setMessage({ tone: 'bad', text: error instanceof Error ? error.message : 'Could not prepare code.' });
    } finally {
      setBusy('');
    }
  }

  async function confirmCode() {
    if (!pending) return;
    setBusy('confirm');
    try {
      const completed = await api<AppleRequest>(`/app-store/custom-codes/${pending.id}/confirm`, {
        method: 'POST',
        body: JSON.stringify({ confirmed: true }),
      });
      setPending(null);
      setCustomCode('');
      setMessage({ tone: 'ok', text: `${completed.custom_code} was created. Apple may take up to an hour to activate it.` });
      await refreshStatus();
    } catch (error) {
      setPending(null);
      setMessage({ tone: 'bad', text: error instanceof Error ? error.message : 'Apple code creation failed.' });
      await refreshStatus();
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="ops-page">
      <div className="ops-grid-plane" aria-hidden="true" />
      <header className="ops-hero">
        <div>
          <p className="ops-eyebrow"><i /> J.A.R.V.I.S. REMOTE OPERATIONS // AUTHORITY: OWNER</p>
          <h2>Control the business from anywhere.</h2>
          <p>Real connected actions, clear safeguards, and no fake “automated” buttons.</p>
        </div>
        <div className="ops-reactor" aria-hidden="true"><i /><b /><span /></div>
        <div className="ops-hero-stats">
          <span><b>{String(CAPABILITIES.filter((item) => item.state === 'LIVE').length).padStart(2, '0')}</b> LIVE MODULES</span>
          <span><b>{status?.configured ? '01' : '00'}</b> APPLE LINK</span>
          <span><b>{status?.requests.filter((item) => item.status === 'succeeded').length ?? 0}</b> CODES MADE</span>
        </div>
      </header>

      {message && <div className={`ops-alert ${message.tone}`}>{message.text}</div>}

      <section className="ops-section">
        <div className="ops-section-head">
          <div><span>01 // COMMAND MODULES</span><h3>Available from this dashboard</h3></div>
          <small>LIVE = WORKING NOW · NEXT = HONESTLY NOT BUILT YET</small>
        </div>
        <div className="ops-catalogue">
          {CAPABILITIES.map((item, index) => {
            const content = (
              <>
                <span className="ops-module-index">M-{String(index + 1).padStart(2, '0')}</span>
                <i className="ops-module-icon">{item.icon}</i>
                <div><h4>{item.title}</h4><p>{item.copy}</p></div>
                <b className={`ops-module-state ${item.tone}`}>{item.state}</b>
              </>
            );
            return item.href?.startsWith('/')
              ? <Link className="ops-module" to={item.href} key={item.title}>{content}</Link>
              : item.href
                ? <a className="ops-module" href={item.href} key={item.title}>{content}</a>
                : <article className="ops-module dormant" key={item.title}>{content}</article>;
          })}
        </div>
      </section>

      <section className="ops-section apple-console" id="apple-codes">
        <div className="ops-section-head">
          <div><span>02 // APP STORE CONNECT</span><h3>Apple offer-code forge</h3></div>
          <span className={`ops-link-state ${status?.configured ? 'online' : ''}`}><i /> {status?.configured ? 'SECURE LINK ONLINE' : 'SETUP REQUIRED'}</span>
        </div>

        <div className="apple-truth-grid">
          <article><b>NO APP UPDATE</b><p>Creating a code for an existing approved subscription offer does not require a new app release.</p></article>
          <article><b>NOT A GENERIC COUPON</b><p>Apple codes only apply to an existing App Store offer. A brand-new app feature still needs a release.</p></article>
          <article><b>OWNER CONFIRMATION</b><p>The console always creates a preview first. Nothing reaches Apple until you confirm the final action.</p></article>
        </div>

        {!status?.configured || showCredentials ? (
          <form className="apple-connect" onSubmit={connectApple}>
            <div className="apple-connect-copy">
              <span>ENCRYPTED CREDENTIAL BAY</span>
              <h4>{status?.configured ? 'Replace App Store credentials' : 'Connect App Store Connect once'}</h4>
              <p>Use an API key with Account Holder, Admin, App Manager or Marketing access. The .p8 key is encrypted before storage and never returned to this browser.</p>
            </div>
            <label>Issuer ID<input value={issuerId} onChange={(event) => setIssuerId(event.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" required /></label>
            <label>Key ID<input value={keyId} onChange={(event) => setKeyId(event.target.value.toUpperCase())} placeholder="ABC123DEFG" maxLength={10} required /></label>
            <label className="p8-field">Private key (.p8)
              <input type="file" accept=".p8,text/plain" required={!privateKey} onChange={async (event) => setPrivateKey(await event.target.files?.[0]?.text() ?? '')} />
              <small>{privateKey ? 'Private key loaded locally and ready to encrypt.' : 'Choose the one-time .p8 download from Apple.'}</small>
            </label>
            <div className="row">
              <button className="primary" disabled={busy === 'credentials' || !privateKey}>{busy === 'credentials' ? 'VERIFYING…' : 'VERIFY & ENCRYPT'}</button>
              {status?.configured && <button type="button" onClick={() => setShowCredentials(false)}>CANCEL</button>}
            </div>
          </form>
        ) : (
          <div className="apple-connected-line">
            <span><i /> App Store Connect credentials verified and encrypted</span>
            <button onClick={() => setShowCredentials(true)}>REPLACE KEY</button>
          </div>
        )}

        {status?.configured && (
          <form className="code-forge" onSubmit={previewCode}>
            <div className="forge-step"><b>1</b><span>APP</span><select value={appleAppId} onChange={(event) => chooseApp(event.target.value)} required><option value="">Select an app</option>{apps.map((item) => <option value={item.id} key={item.id}>{item.name} · {item.bundle_id}</option>)}</select></div>
            <div className="forge-step"><b>2</b><span>SUBSCRIPTION</span><select value={subscriptionId} onChange={(event) => chooseSubscription(event.target.value)} disabled={!appleAppId || busy === 'subscriptions'} required><option value="">{busy === 'subscriptions' ? 'Loading…' : 'Select a subscription'}</option>{subscriptions.map((item) => <option value={item.id} key={item.id}>{item.name} · {item.state}</option>)}</select></div>
            <div className="forge-step"><b>3</b><span>EXISTING OFFER</span><select value={offerId} onChange={(event) => setOfferId(event.target.value)} disabled={!subscriptionId || busy === 'offers'} required><option value="">{busy === 'offers' ? 'Loading…' : 'Select an active offer'}</option>{offers.map((item) => <option value={item.id} key={item.id}>{item.name} · {item.mode} {item.duration}</option>)}</select></div>
              <div className="forge-step code-entry"><b>4</b><span>CUSTOM CODE</span><input value={customCode} onChange={(event) => setCustomCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} placeholder="DEADSETVIP" maxLength={64} minLength={2} required /><small>Letters and numbers only</small></div>
            <div className="forge-step"><b>5</b><span>REDEMPTION LIMIT</span><input type="number" min={1} max={25000} value={redemptionLimit} onChange={(event) => setRedemptionLimit(Number(event.target.value))} required /></div>
            <div className="forge-step"><b>6</b><span>EXPIRY (OPTIONAL)</span><input type="date" value={expirationDate} onChange={(event) => setExpirationDate(event.target.value)} /></div>
            <div className="forge-authority"><div><span>PRODUCTION AUTHORITY</span><p>This prepares an audit entry only. You will see a final confirmation before Apple is changed.</p></div><button className="primary" disabled={!offerId || busy === 'preview'}>{busy === 'preview' ? 'CHECKING…' : 'PREVIEW CODE MISSION'}</button></div>
          </form>
        )}
      </section>

      <section className="ops-section">
        <div className="ops-section-head"><div><span>03 // AUDIT STREAM</span><h3>Recent Apple operations</h3></div></div>
        <div className="ops-history">
          {status?.requests.length ? status.requests.map((request) => (
            <article key={request.id}>
              <span className={`history-state ${request.status}`}>{request.status.replace('_', ' ')}</span>
              <div><b>{request.custom_code}</b><p>{request.app_name} · {request.subscription_name} · {request.offer_name}</p></div>
              <small>{request.redemption_limit.toLocaleString()} redemption{request.redemption_limit === 1 ? '' : 's'}<br />{new Date(request.created_at).toLocaleString()}</small>
              {request.redemption_url && <a href={request.redemption_url} target="_blank" rel="noreferrer">REDEEM ↗</a>}
              {request.error && <em>{request.error}</em>}
            </article>
          )) : <div className="empty">No Apple operations yet.</div>}
        </div>
      </section>

      {pending && (
        <div className="ops-modal-shell" role="dialog" aria-modal="true" aria-labelledby="confirm-code-title">
          <button className="ops-modal-scrim" aria-label="Cancel" onClick={() => setPending(null)} />
          <div className="ops-modal">
            <span>FINAL PRODUCTION CONFIRMATION</span>
            <h3 id="confirm-code-title">Create {pending.custom_code}?</h3>
            <dl><div><dt>App</dt><dd>{pending.app_name}</dd></div><div><dt>Subscription</dt><dd>{pending.subscription_name}</dd></div><div><dt>Offer</dt><dd>{pending.offer_name}</dd></div><div><dt>Redemptions</dt><dd>{pending.redemption_limit.toLocaleString()}</dd></div><div><dt>Expiry</dt><dd>{pending.expiration_date ?? 'No end date'}</dd></div></dl>
            <p>This changes production App Store Connect data. Apple says codes may take up to one hour to become redeemable.</p>
            <div className="row"><button onClick={() => setPending(null)}>CANCEL</button><button className="primary" disabled={busy === 'confirm'} onClick={confirmCode}>{busy === 'confirm' ? 'CREATING WITH APPLE…' : 'CONFIRM & CREATE'}</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
