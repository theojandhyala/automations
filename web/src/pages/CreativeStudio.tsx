import { useMemo, useState } from 'react';
import { api, supabase } from '../lib/supabase';
import { useData } from '../lib/useData';
import { Empty } from '../components/bits';

interface FeatureSpec {
  key: string;
  label: string;
}

interface CreativeAsset {
  id: string;
  asset_key: string;
  label: string;
  public_url: string;
  updated_at: string;
}

interface StudioState {
  pexels: { configured: boolean };
  required_features: FeatureSpec[];
  features: CreativeAsset[];
}

interface ProducerAutomation {
  id: string;
  status: string;
  enabled: boolean;
  last_run_at: string | null;
  current_task: string | null;
}

export default function CreativeStudio() {
  const [pexelsKey, setPexelsKey] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, refresh } = useData(async () => {
    const [studio, producer] = await Promise.all([
      api<StudioState>('/creative-studio'),
      supabase.from('automations').select('id,status,enabled,last_run_at,current_task')
        .eq('handler_key', 'tiktok.produce').maybeSingle(),
    ]);
    if (producer.error) throw producer.error;
    return { studio, producer: producer.data as ProducerAutomation | null };
  }, []);

  const features = useMemo(
    () => new Map(data?.studio.features.map((asset) => [asset.asset_key, asset]) ?? []),
    [data],
  );

  async function connectPexels(event: React.FormEvent) {
    event.preventDefault();
    setBusy('pexels'); setError(null); setNotice(null);
    try {
      await api('/integrations/pexels', {
        method: 'PUT',
        body: JSON.stringify({ api_key: pexelsKey }),
      });
      setPexelsKey('');
      setNotice('Pexels connected. The key is encrypted and is never returned to this browser.');
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function uploadFeature(assetKey: string, file: File | null) {
    if (!file) return;
    setBusy(assetKey); setError(null); setNotice(null);
    try {
      const form = new FormData();
      form.set('asset_key', assetKey);
      form.set('file', file);
      await api('/creative-assets', { method: 'POST', body: form });
      setNotice(`${data?.studio.required_features.find((item) => item.key === assetKey)?.label ?? assetKey} updated.`);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function runProducer() {
    if (!data?.producer) return;
    setBusy('producer'); setError(null); setNotice(null);
    try {
      await api(`/automations/${data.producer.id}/run`, { method: 'POST' });
      setNotice('Production started. Finished slides will appear in the review queue.');
      window.setTimeout(refresh, 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  if (!data) return <Empty>Loading creative studio…</Empty>;
  const uploaded = features.size;
  const total = data.studio.required_features.length;
  const ready = data.studio.pexels.configured && uploaded === total;

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Creative studio</h2>
          <p>Connect free stock, keep exact Deadset screens current, and build TikTok-ready slides from anywhere.</p>
        </div>
        <div className={`studio-readiness ${ready ? 'ready' : ''}`}>
          <span>{ready ? 'Production ready' : 'Setup needed'}</span>
          <strong>{uploaded}/{total} screens</strong>
        </div>
      </div>

      {error && <div className="card studio-alert error">{error}</div>}
      {notice && <div className="card studio-alert success">{notice}</div>}

      <section className="card studio-provider">
        <div>
          <span className="section-label">Licensed photo source</span>
          <h3>Pexels</h3>
          <p>
            Real stock photos, free to use and edit for social promotion. Pinterest stays mood-reference only.{' '}
            <a href="https://www.pexels.com/api/" target="_blank" rel="noreferrer">Get a free key</a>.
          </p>
        </div>
        {data.studio.pexels.configured ? (
          <span className="provider-status connected">Connected</span>
        ) : (
          <form onSubmit={connectPexels} className="provider-form">
            <input
              type="password"
              value={pexelsKey}
              onChange={(event) => setPexelsKey(event.target.value)}
              placeholder="Paste your free Pexels API key"
              autoComplete="off"
              required
              minLength={16}
            />
            <button className="primary" disabled={busy === 'pexels'}>
              {busy === 'pexels' ? 'Checking…' : 'Connect'}
            </button>
          </form>
        )}
      </section>

      <div className="studio-section-head">
        <div>
          <h3>Exact Deadset feature screens</h3>
          <p>Upload each current app screen once. Replacing one updates every future carousel.</p>
        </div>
      </div>

      <div className="feature-library">
        {data.studio.required_features.map((spec) => {
          const asset = features.get(spec.key);
          return (
            <article className="card feature-asset" key={spec.key}>
              <div className="feature-preview">
                {asset ? <img src={asset.public_url} alt={`${spec.label} current Deadset screen`} /> : <span>Screen needed</span>}
              </div>
              <div className="row between">
                <div>
                  <strong>{spec.label}</strong>
                  <div className="mono muted">{spec.key}</div>
                </div>
                <span className={`provider-status ${asset ? 'connected' : ''}`}>{asset ? 'Ready' : 'Missing'}</span>
              </div>
              <label className="upload-button">
                {busy === spec.key ? 'Uploading…' : asset ? 'Replace exact screen' : 'Upload exact screen'}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={busy === spec.key}
                  onChange={(event) => uploadFeature(spec.key, event.target.files?.[0] ?? null)}
                />
              </label>
            </article>
          );
        })}
      </div>

      <section className="card production-console">
        <div>
          <span className="section-label">Automatic production agent</span>
          <h3>{data.producer?.current_task ?? 'Build waiting carousel drafts'}</h3>
          <p>Runs every 15 minutes, creates two hosted 1080×1920 JPEG slides per draft, then stops at review.</p>
        </div>
        <button
          className="primary"
          onClick={runProducer}
          disabled={!data.producer || data.producer.status === 'running' || busy === 'producer'}
        >
          {data.producer?.status === 'running' || busy === 'producer' ? 'Building…' : 'Build waiting drafts now'}
        </button>
      </section>
    </>
  );
}
