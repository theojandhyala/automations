import { useMemo, useState } from 'react';
import { api } from '../lib/supabase';
import { useData } from '../lib/useData';
import { Empty } from '../components/bits';

interface FeatureSpec { key: string; label: string; truth: string; stockDirection: string }
interface CreativeAsset { id: string; asset_key: string; label: string; public_url: string; updated_at: string }
interface ProducerAutomation { id: string; status: string; enabled: boolean; last_run_at: string | null; current_task: string | null }
interface RendererCapacity {
  available: boolean;
  active_sessions: number;
  idle_sessions: number;
  allowed_browser_acquisitions: number;
  retry_after_ms: number;
  message: string;
}
interface StudioState {
  app: { id: string; slug: string; name: string; accent: string };
  playbook: { version: string; positioning: string; claims_to_avoid: string[]; caption_suffix: string };
  pexels: { configured: boolean };
  renderer: RendererCapacity;
  required_features: FeatureSpec[];
  features: CreativeAsset[];
  producer: ProducerAutomation | null;
}

export default function CreativeStudio() {
  const [appSlug, setAppSlug] = useState<'deadset' | 'cast'>('deadset');
  const [pexelsKey, setPexelsKey] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, refresh } = useData(
    () => api<StudioState>(`/creative-studio?app_slug=${appSlug}`),
    [appSlug],
  );

  const features = useMemo(
    () => new Map(data?.features.map((asset) => [asset.asset_key, asset]) ?? []),
    [data],
  );

  function selectWorkspace(slug: 'deadset' | 'cast') {
    setAppSlug(slug);
    setNotice(null);
    setError(null);
  }

  async function connectPexels(event: React.FormEvent) {
    event.preventDefault();
    setBusy('pexels'); setError(null); setNotice(null);
    try {
      await api('/integrations/pexels', { method: 'PUT', body: JSON.stringify({ api_key: pexelsKey }) });
      setPexelsKey('');
      setNotice('Pexels connected for both workspaces. The key is encrypted and never returned to this browser.');
      refresh();
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(null); }
  }

  async function uploadFeature(assetKey: string, file: File | null) {
    if (!file) return;
    setBusy(assetKey); setError(null); setNotice(null);
    try {
      const form = new FormData();
      form.set('app_slug', appSlug);
      form.set('asset_key', assetKey);
      form.set('file', file);
      await api('/creative-assets', { method: 'POST', body: form });
      setNotice(`${data?.required_features.find((item) => item.key === assetKey)?.label ?? assetKey} updated for ${data?.app.name}.`);
      refresh();
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(null); }
  }

  async function runProducer() {
    if (!data?.producer) return;
    setBusy('producer'); setError(null); setNotice(null);
    try {
      await api(`/automations/${data.producer.id}/run`, { method: 'POST' });
      setNotice(`${data.app.name} production started. Finished slides will stop in your review queue.`);
      window.setTimeout(refresh, 2500);
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(null); }
  }

  if (!data || data.app.slug !== appSlug) return <Empty>Loading {appSlug === 'cast' ? 'Cast' : 'Deadset'} creative studio…</Empty>;
  const uploaded = features.size;
  const total = data.required_features.length;
  const ready = data.pexels.configured && uploaded === total && Boolean(data.producer);

  return (
    <div className="studio-workspace" style={{ '--studio-accent': data.app.accent } as React.CSSProperties}>
      <div className="page-head">
        <div><h2>Creative studio</h2><p>Exact product truth, licensed source imagery and deterministic checks for each active app.</p></div>
        <div className={`studio-readiness ${ready ? 'ready' : ''}`}><span>{ready ? 'Production ready' : 'Setup needed'}</span><strong>{uploaded}/{total} exact screens</strong></div>
      </div>

      <div className="studio-app-switch" role="tablist" aria-label="Creative workspace">
        {(['deadset', 'cast'] as const).map((slug) => <button type="button" role="tab" aria-selected={appSlug === slug} className={appSlug === slug ? 'active' : ''} onClick={() => selectWorkspace(slug)} key={slug}><i />{slug.toUpperCase()}<small>{slug === 'deadset' ? 'FITNESS ENGINE' : 'ANGLING ENGINE'}</small></button>)}
        <div><span>PLAYBOOK LOCK</span><b>{data.playbook.version}</b></div>
      </div>

      {error && <div className="card studio-alert error">{error}</div>}
      {notice && <div className="card studio-alert success">{notice}</div>}

      <section className="studio-doctrine">
        <div><span>PRODUCT POSITION</span><p>{data.playbook.positioning}</p></div>
        <div><span>CAPTION HANDOFF</span><p>{data.playbook.caption_suffix}</p></div>
        <div><span>CLAIM FIREWALL</span><p>{data.playbook.claims_to_avoid.slice(0, 4).join(' · ')}</p></div>
      </section>

      <section className="card studio-provider">
        <div><span className="section-label">Licensed real-photo source · shared by Deadset and Cast</span><h3>Pexels</h3><p>Stock images are licensed and recorded. Pinterest remains reference-only. <a href="https://www.pexels.com/api/" target="_blank" rel="noreferrer">Get a free key</a>.</p></div>
        {data.pexels.configured ? <span className="provider-status connected">Connected</span> : <form onSubmit={connectPexels} className="provider-form"><input type="password" value={pexelsKey} onChange={(event) => setPexelsKey(event.target.value)} placeholder="Paste your free Pexels API key" autoComplete="off" required minLength={16} /><button className="primary" disabled={busy === 'pexels'}>{busy === 'pexels' ? 'Checking…' : 'Connect'}</button></form>}
      </section>

      <div className="studio-section-head"><div><h3>Exact {data.app.name} feature screens</h3><p>The agent may only choose from this verified library. Each upload replaces the matching proof screen for future drafts.</p></div></div>

      <div className="feature-library">
        {data.required_features.map((spec) => {
          const asset = features.get(spec.key);
          return <article className="card feature-asset" key={spec.key}>
            <div className="feature-preview">{asset ? <img src={asset.public_url} alt={`${spec.label} current ${data.app.name} screen`} /> : <span>Exact screen needed</span>}</div>
            <div className="row between"><div><strong>{spec.label}</strong><div className="mono muted">{spec.key}</div></div><span className={`provider-status ${asset ? 'connected' : ''}`}>{asset ? 'Verified' : 'Missing'}</span></div>
            <p className="feature-truth">{spec.truth}</p>
            <label className="upload-button">{busy === spec.key ? 'Uploading…' : asset ? 'Replace exact screen' : 'Upload exact screen'}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy === spec.key} onChange={(event) => uploadFeature(spec.key, event.target.files?.[0] ?? null)} /></label>
          </article>;
        })}
      </div>

      <section className="card production-console">
        <div><span className="section-label">Automatic {data.app.name} production agent</span><h3>{data.producer?.current_task ?? 'Build waiting carousel drafts'}</h3><p>Renders hosted 1080×1920 JPEG slides in one reusable free Browser Run session, records source provenance and stops at owner review.</p><span className={`provider-status ${data.renderer.available ? 'connected' : ''}`}>{data.renderer.message}</span></div>
        <button className="primary" onClick={runProducer} disabled={!data.producer || data.producer.status === 'running' || busy === 'producer'}>{data.producer?.status === 'running' || busy === 'producer' ? 'Building…' : `Build waiting ${data.app.name} drafts`}</button>
      </section>
    </div>
  );
}
