import { useState } from 'react';
import { api, supabase } from '../lib/supabase';
import { useData } from '../lib/useData';
import { Ago, Dot, Empty } from '../components/bits';
import type { Account, App, Artifact, TikTokPrivacyLevel } from '../lib/types';
import { formatHashtags, normalizeHashtags } from '../lib/hashtags';

const FILTERS = ['draft', 'approved', 'publishing', 'published', 'failed', 'rejected'] as const;

interface CreatorInfo {
  creator_username: string;
  creator_nickname: string;
  creator_avatar_url: string | null;
  privacy_level_options: TikTokPrivacyLevel[];
  comment_disabled: boolean;
  duet_disabled: boolean;
  stitch_disabled: boolean;
  max_video_post_duration_sec: number;
}

function urlsFromTextarea(value: string): string[] {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

/**
 * The review queue is also the required TikTok export screen: it previews the
 * exact media, fetches current creator choices, and records explicit consent.
 */
export default function Queue() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('draft');
  const [error, setError] = useState<string | null>(null);
  const [creatorInfo, setCreatorInfo] = useState<Record<string, CreatorInfo>>({});
  const [loadingAccount, setLoadingAccount] = useState<string | null>(null);
  const [consent, setConsent] = useState<Record<string, boolean>>({});
  const [producing, setProducing] = useState<string | null>(null);
  const [uploadingSlides, setUploadingSlides] = useState<string | null>(null);
  const [renderSource, setRenderSource] = useState<Record<string, { url: string; photographer: string }>>({});
  const [manualPost, setManualPost] = useState<Record<string, string>>({});
  const [recordingPost, setRecordingPost] = useState<string | null>(null);

  const { data, refresh } = useData(async () => {
    const [artifacts, apps, accounts, tiktokStatus] = await Promise.all([
      supabase.from('artifacts').select('*').eq('status', filter)
        .order('created_at', { ascending: false }).limit(60),
      supabase.from('apps').select('*'),
      supabase.from('tiktok_accounts_public').select('*'),
      api<{ public_direct_post_ready: boolean }>('/tiktok/status'),
    ]);
    if (artifacts.error) throw artifacts.error;
    return {
      artifacts: artifacts.data as Artifact[],
      apps: (apps.data ?? []) as App[],
      accounts: (accounts.data ?? []) as Account[],
      tiktokStatus,
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

  async function loadCreator(accountId: string) {
    if (!accountId) return;
    setError(null);
    setLoadingAccount(accountId);
    try {
      const info = await api<CreatorInfo>(`/tiktok/accounts/${accountId}/creator-info`);
      setCreatorInfo((current) => ({ ...current, [accountId]: info }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingAccount(null);
    }
  }

  async function produce(id: string) {
    setError(null);
    setProducing(id);
    try {
      await api(`/artifacts/${id}/produce`, { method: 'POST' });
      window.setTimeout(refresh, 3000);
      window.setTimeout(refresh, 8000);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setProducing(null);
    }
  }

  async function uploadRenderedSlides(artifact: Artifact, files: FileList | null) {
    if (!files || files.length !== 2) {
      setError('Choose exactly two rendered slides in posting order.');
      return;
    }
    setError(null);
    setUploadingSlides(artifact.id);
    try {
      const form = new FormData();
      form.append('slides', files[0]!);
      form.append('slides', files[1]!);
      const source = renderSource[artifact.id];
      if (source?.url) form.set('source_url', source.url);
      if (source?.photographer) form.set('photographer', source.photographer);
      await api(`/artifacts/${artifact.id}/rendered-slides`, { method: 'POST', body: form });
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploadingSlides(null);
    }
  }

  async function recordManualPost(id: string) {
    const post = manualPost[id]?.trim();
    if (!post) return;
    setError(null);
    setRecordingPost(id);
    try {
      await api(`/artifacts/${id}/manual-publish`, { method: 'POST', body: JSON.stringify({ post }) });
      setManualPost((current) => ({ ...current, [id]: '' }));
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRecordingPost(null);
    }
  }

  async function approveForManualPost(id: string) {
    setError(null);
    try {
      await api(`/artifacts/${id}/manual-approve`, {
        method: 'POST',
        body: JSON.stringify({ confirmed: true }),
      });
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function copyPostText(artifact: Artifact) {
    const tags = formatHashtags(artifact.hashtags);
    await navigator.clipboard.writeText([artifact.caption, tags].filter(Boolean).join('\n\n'));
  }

  if (!data) return <Empty>Loading…</Empty>;
  const manualMode = !data.tiktokStatus.public_direct_post_ready;

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Review queue</h2>
          <p>Preview every slide, choose the live TikTok settings, then explicitly approve the post.</p>
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
        {data.artifacts.map((artifact) => {
          const app = data.apps.find((item) => item.id === artifact.app_id);
          const account = data.accounts.find((item) => item.id === artifact.account_id);
          const info = artifact.account_id ? creatorInfo[artifact.account_id] : undefined;
          const isEditable = artifact.status === 'draft' || artifact.status === 'approved';
          const mediaReady = artifact.media_type === 'photo'
            ? artifact.photo_urls.length > 0
            : Boolean(artifact.video_url);
          const canApprove = mediaReady
            && (manualMode
              ? Boolean(artifact.asset_manifest.creative_quality?.pass) && Boolean(consent[artifact.id])
              : Boolean(artifact.account_id)
                && Boolean(info)
                && Boolean(artifact.tiktok_privacy_level)
                && artifact.brand_organic_toggle
                && Boolean(consent[artifact.id]));
          const quality = artifact.asset_manifest.creative_quality;

          return (
            <article className="card" key={artifact.id}>
              <div className="row between" style={{ marginBottom: 10 }}>
                <div className="row">
                  <Dot status={artifact.status} />
                  <strong>{artifact.hook ?? 'Untitled'}</strong>
                  {app && <span className="pill">{app.name}</span>}
                  <span className="pill">{artifact.media_type === 'photo' ? 'Photo carousel' : 'Video'}</span>
                </div>
                <span className="muted"><Ago at={artifact.created_at} /></span>
              </div>

              {artifact.asset_manifest.slides?.length ? (
                <div className="creative-plan">
                  {artifact.asset_manifest.slides.map((slide, index) => (
                    <div key={`${artifact.id}-slide-${index}`}>
                      <strong>Slide {index + 1} · {slide.role === 'feature_proof' ? `${app?.name ?? 'App'} proof` : 'real-photo hook'}</strong>
                      <p>“{slide.overlay}”</p>
                      <span>{slide.asset_query ?? slide.app_asset_key}</span>
                    </div>
                  ))}
                  <p className="muted" style={{ margin: 0 }}>
                    {artifact.asset_manifest.licence_note}
                  </p>
                </div>
              ) : null}

              {artifact.media_type === 'photo' && artifact.photo_urls.length > 0 && (
                <div className="media-preview" aria-label="Exact photo carousel preview">
                  {artifact.photo_urls.map((url, index) => (
                    <figure key={url}>
                      <img src={url} alt={`Slide ${index + 1}`} />
                      <figcaption>Slide {index + 1}</figcaption>
                    </figure>
                  ))}
                </div>
              )}
              {artifact.media_type === 'video' && artifact.video_url && (
                <video className="video-preview" src={artifact.video_url} controls playsInline />
              )}

              {artifact.error && <p className="mono" style={{ color: 'var(--bad)' }}>{artifact.error}</p>}

              <div className={`creative-score ${quality?.pass ? 'pass' : quality ? 'fail' : 'pending'}`}>
                <div><span>NATIVE QUALITY GATE</span><strong>{quality ? `${quality.score}/100` : 'CHECK REQUIRED'}</strong></div>
                <p>{quality
                  ? quality.pass ? 'Specific, readable and native enough to continue to owner review.' : [...quality.blockers, ...quality.warnings].join(' ')
                  : 'This older draft will be scored when you edit it or try to approve it.'}</p>
                {isEditable && <button type="button" onClick={() => patch(artifact.id, { hook: artifact.hook })}>Recheck quality</button>}
              </div>

              {artifact.status === 'draft' && artifact.media_type === 'photo' && Boolean(artifact.asset_manifest.slides?.length) && (
                <div className="row" style={{ marginBottom: 14 }}>
                  <button
                    className="primary"
                    onClick={() => produce(artifact.id)}
                    disabled={producing === artifact.id}
                  >
                    {producing === artifact.id ? 'Starting production…' : mediaReady ? 'Rebuild final slides' : 'Build final slides'}
                  </button>
                  <label className="upload-button">
                    {uploadingSlides === artifact.id ? 'Uploading slides…' : 'Use device renderer'}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      multiple
                      aria-label={`Upload locally rendered slides for ${artifact.hook ?? 'draft'}`}
                      disabled={uploadingSlides === artifact.id}
                      onChange={(event) => uploadRenderedSlides(artifact, event.target.files)}
                    />
                  </label>
                  {!mediaReady && <>
                    <input
                      aria-label={`Licensed source URL for ${artifact.hook ?? 'draft'}`}
                      placeholder="Licensed source URL"
                      value={renderSource[artifact.id]?.url ?? ''}
                      onChange={(event) => setRenderSource((current) => ({
                        ...current,
                        [artifact.id]: { url: event.target.value, photographer: current[artifact.id]?.photographer ?? '' },
                      }))}
                    />
                    <input
                      aria-label={`Photographer for ${artifact.hook ?? 'draft'}`}
                      placeholder="Photographer"
                      value={renderSource[artifact.id]?.photographer ?? ''}
                      onChange={(event) => setRenderSource((current) => ({
                        ...current,
                        [artifact.id]: { url: current[artifact.id]?.url ?? '', photographer: event.target.value },
                      }))}
                    />
                  </>}
                </div>
              )}

              {isEditable && (
                <div className="review-fields">
                  <div className="field">
                    <label>Hook / title</label>
                    <input
                      defaultValue={artifact.hook ?? ''}
                      maxLength={300}
                      onBlur={(event) => {
                        const value = event.target.value.trim();
                        if (value !== (artifact.hook ?? '')) patch(artifact.id, { hook: value || null });
                      }}
                    />
                  </div>
                  <div className="field">
                    <label>Editable TikTok caption</label>
                    <textarea
                      defaultValue={artifact.caption ?? ''}
                      maxLength={2200}
                      onBlur={(event) => {
                        const value = event.target.value.trim();
                        if (value !== (artifact.caption ?? '')) patch(artifact.id, { caption: value || null });
                      }}
                    />
                  </div>
                  <div className="field">
                    <label>Real TikTok hashtags (kept separate automatically)</label>
                    <input
                      defaultValue={formatHashtags(artifact.hashtags)}
                      onBlur={(event) => {
                        const tags = normalizeHashtags([event.target.value]);
                        event.target.value = formatHashtags(tags);
                        if (JSON.stringify(tags) !== JSON.stringify(artifact.hashtags)) patch(artifact.id, { hashtags: tags });
                      }}
                    />
                    <small className="muted">TikTok receives: {formatHashtags(artifact.hashtags) || 'add 3–5 hashtags'}</small>
                  </div>

                  <div className="grid" style={{ gridTemplateColumns: '170px 1fr' }}>
                    <div className="field">
                      <label>Media type</label>
                      <select
                        value={artifact.media_type}
                        onChange={(event) => patch(artifact.id, { media_type: event.target.value })}
                      >
                        <option value="photo">Photo carousel</option>
                        <option value="video">Video</option>
                      </select>
                    </div>
                    {artifact.media_type === 'photo' ? (
                      <div className="field">
                        <label>Final HTTPS slide URLs — one per line, in posting order</label>
                        <textarea
                          className="mono"
                          defaultValue={artifact.photo_urls.join('\n')}
                          placeholder={'https://verified.example/slide-1.jpg\nhttps://verified.example/slide-2.jpg'}
                          onBlur={(event) => {
                            const urls = urlsFromTextarea(event.target.value);
                            if (JSON.stringify(urls) !== JSON.stringify(artifact.photo_urls)) {
                              patch(artifact.id, { photo_urls: urls });
                            }
                          }}
                        />
                      </div>
                    ) : (
                      <div className="field">
                        <label>Video URL on a TikTok-verified domain</label>
                        <input
                          defaultValue={artifact.video_url ?? ''}
                          placeholder="https://verified.example/video.mp4"
                          onBlur={(event) => {
                            const value = event.target.value.trim();
                            if (value !== (artifact.video_url ?? '')) patch(artifact.id, { video_url: value || null });
                          }}
                        />
                      </div>
                    )}
                  </div>

                  {!manualMode && <div className="grid" style={{ gridTemplateColumns: '1fr auto', alignItems: 'end' }}>
                    <div className="field" style={{ margin: 0 }}>
                      <label>TikTok account</label>
                      <select
                        value={artifact.account_id ?? ''}
                        onChange={(event) => {
                          const accountId = event.target.value;
                          patch(artifact.id, {
                            account_id: accountId || null,
                            tiktok_privacy_level: null,
                            posting_consent: false,
                          });
                          if (accountId) loadCreator(accountId);
                        }}
                      >
                        <option value="">— pick one —</option>
                        {data.accounts
                          .filter((item) => item.status === 'connected' && (!item.app_id || item.app_id === artifact.app_id))
                          .map((item) => <option key={item.id} value={item.id}>@{item.handle}</option>)}
                      </select>
                    </div>
                    <button
                      onClick={() => artifact.account_id && loadCreator(artifact.account_id)}
                      disabled={!artifact.account_id || loadingAccount === artifact.account_id}
                    >
                      {loadingAccount === artifact.account_id ? 'Checking…' : 'Refresh TikTok choices'}
                    </button>
                  </div>}

                  {!manualMode && account && info && (
                    <div className="tiktok-export">
                      <div className="row between">
                        <strong>Posting to {info.creator_nickname} (@{info.creator_username})</strong>
                        <span className="pill">live TikTok settings</span>
                      </div>
                      <div className="field">
                        <label>Privacy — choose manually</label>
                        <select
                          value={artifact.tiktok_privacy_level ?? ''}
                          onChange={(event) => patch(artifact.id, {
                            tiktok_privacy_level: event.target.value || null,
                            posting_consent: false,
                          })}
                        >
                          <option value="">— no default —</option>
                          {info.privacy_level_options.map((level) => (
                            <option key={level} value={level}>{level.replaceAll('_', ' ').toLowerCase()}</option>
                          ))}
                        </select>
                      </div>
                      <label className="check-row">
                        <input
                          type="checkbox"
                          checked={!artifact.disable_comment && !info.comment_disabled}
                          disabled={info.comment_disabled}
                          onChange={(event) => patch(artifact.id, { disable_comment: !event.target.checked, posting_consent: false })}
                        />
                        Allow comments {info.comment_disabled ? '(disabled in TikTok settings)' : ''}
                      </label>
                      {artifact.media_type === 'photo' && (
                        <label className="check-row">
                          <input
                            type="checkbox"
                            checked={artifact.auto_add_music}
                            onChange={(event) => patch(artifact.id, { auto_add_music: event.target.checked, posting_consent: false })}
                          />
                          Let TikTok add recommended music
                        </label>
                      )}
                      <label className="check-row">
                        <input
                          type="checkbox"
                          checked={artifact.brand_organic_toggle}
                          onChange={(event) => patch(artifact.id, { brand_organic_toggle: event.target.checked, posting_consent: false })}
                        />
                        This promotes my own brand (TikTok labels it “Promotional content”)
                      </label>
                      <label className="check-row">
                        <input
                          type="checkbox"
                          checked={artifact.brand_content_toggle}
                          onChange={(event) => patch(artifact.id, { brand_content_toggle: event.target.checked, posting_consent: false })}
                        />
                        Paid partnership for another brand
                      </label>
                      <label className="check-row consent-row">
                        <input
                          type="checkbox"
                          checked={Boolean(consent[artifact.id])}
                          onChange={(event) => setConsent((current) => ({
                            ...current,
                            [artifact.id]: event.target.checked,
                          }))}
                        />
                        By posting, I agree to TikTok’s Music Usage Confirmation
                        {artifact.brand_content_toggle ? ' and Branded Content Policy' : ''}.
                      </label>
                    </div>
                  )}

                  {manualMode && (
                    <div className="tiktok-export">
                      <div className="row between">
                        <strong>Manual TikTok handoff</strong>
                        <span className="pill">available now</span>
                      </div>
                      <p className="muted">TikTok API review is pending. Approval unlocks the exact downloads and copy button; you remain in control of the final TikTok privacy, music and disclosure choices.</p>
                      <label className="check-row consent-row">
                        <input
                          type="checkbox"
                          checked={Boolean(consent[artifact.id])}
                          onChange={(event) => setConsent((current) => ({ ...current, [artifact.id]: event.target.checked }))}
                        />
                        I reviewed the exact media and copy, and I have the rights to post them.
                      </label>
                    </div>
                  )}
                </div>
              )}

              <div className="row" style={{ marginTop: 14 }}>
                {artifact.status === 'draft' && (
                  <button
                    className="primary"
                    disabled={!canApprove}
                    title={!canApprove ? manualMode ? 'Needs final media, a passing quality check and your review confirmation' : 'Needs final media, refreshed TikTok choices, privacy, own-brand disclosure and consent' : undefined}
                    onClick={() => manualMode
                      ? approveForManualPost(artifact.id)
                      : patch(artifact.id, { status: 'approved', posting_consent: true })}
                  >
                    {manualMode ? 'Approve for manual post' : 'Approve exact post'}
                  </button>
                )}
                {artifact.status === 'approved' && (
                  <button onClick={() => patch(artifact.id, { status: 'draft', posting_consent: false })}>Unapprove</button>
                )}
                {isEditable && (
                  <button className="danger" onClick={() => patch(artifact.id, { status: 'rejected' })}>Reject</button>
                )}
                {(artifact.status === 'rejected' || artifact.status === 'failed') && (
                  <button onClick={() => patch(artifact.id, { status: 'draft' })}>Back to draft</button>
                )}
              </div>

              {artifact.status === 'approved' && mediaReady && (
                <div className="manual-post-handoff">
                  <div><span>POST NOW // TIKTOK REVIEW FALLBACK</span><b>Download the exact media, copy the caption, then record the live post.</b><small>This keeps the mission usable while TikTok reviews Direct Post. Recording the post links later metrics to this creative.</small></div>
                  <div className="row">
                    {artifact.media_type === 'photo'
                      ? artifact.photo_urls.map((url, index) => <a key={url} href={url} target="_blank" rel="noreferrer">OPEN SLIDE {index + 1}</a>)
                      : artifact.video_url && <a href={artifact.video_url} target="_blank" rel="noreferrer">OPEN VIDEO</a>}
                    <button type="button" onClick={() => copyPostText(artifact)}>COPY CAPTION + TAGS</button>
                  </div>
                  <div className="row">
                    <input value={manualPost[artifact.id] ?? ''} onChange={(event) => setManualPost((current) => ({ ...current, [artifact.id]: event.target.value }))} placeholder="Paste TikTok post URL after posting" />
                    <button className="primary" type="button" disabled={!manualPost[artifact.id]?.trim() || recordingPost === artifact.id} onClick={() => recordManualPost(artifact.id)}>{recordingPost === artifact.id ? 'RECORDING…' : 'MARK LIVE'}</button>
                  </div>
                </div>
              )}
            </article>
          );
        })}
        {data.artifacts.length === 0 && <div className="card"><Empty>Nothing {filter}.</Empty></div>}
      </div>
    </>
  );
}
