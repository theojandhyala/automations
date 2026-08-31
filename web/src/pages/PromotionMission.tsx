import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/supabase';

type Goal = 'downloads' | 'feature_discovery' | 'trust' | 'engagement';
type Audience = 'new_lifters' | 'consistent_lifters' | 'serious_gym' | 'general_fitness' | 'new_anglers' | 'weekend_anglers' | 'serious_anglers' | 'local_crews';
type Angle = 'relatable' | 'problem_solution' | 'proof' | 'routine';
type ContentFormat = 'photo_carousel' | 'video_brief';

interface FeatureReadiness { key: string; label: string; uploaded: boolean }
interface PromotionAccount { id: string; handle: string; display_name: string | null; app_id: string | null; status: string }
interface PromotionApp {
  id: string; slug: string; name: string; tagline: string | null; accent: string;
  draft_agent_id: string | null; producer_agent_id: string | null; publish_agent_id: string | null;
  drafting_ready: boolean; production_ready: boolean; publishing_ready: boolean;
  pending_drafts: number; blockers: string[]; playbook_version: string; content_domain: 'fitness' | 'fishing';
  uploaded_feature_keys: string[]; uploaded_feature_count: number; feature_count: number;
  photo_source_ready: boolean; producer_available: boolean;
}
interface Readiness {
  free_ai: boolean; review_required: true; feature_libraries: Record<string, FeatureReadiness[]>;
  accounts: PromotionAccount[]; apps: PromotionApp[];
}
interface Mission {
  id: string; app_id: string; status: 'queued' | 'drafting' | 'producing' | 'awaiting_review' | 'failed';
  goal: Goal; audience: Audience; angle: Angle; content_format: ContentFormat;
  draft_count: number; auto_produce: boolean; error: string | null; created_at: string;
}

const GOALS: Array<{ value: Goal; title: string; copy: string }> = [
  { value: 'downloads', title: 'More downloads', copy: 'Earn qualified App Store visits without sounding like an ad.' },
  { value: 'feature_discovery', title: 'Show a feature', copy: 'Make one useful app capability memorable.' },
  { value: 'trust', title: 'Build trust', copy: 'Use specific, supportable product proof.' },
  { value: 'engagement', title: 'Start conversation', copy: 'Lead with a relatable gym thought people can answer.' },
];
const FITNESS_AUDIENCES: Array<{ value: Audience; title: string }> = [
  { value: 'new_lifters', title: 'New lifters' },
  { value: 'consistent_lifters', title: 'Consistent lifters' },
  { value: 'serious_gym', title: 'Serious gym users' },
  { value: 'general_fitness', title: 'General fitness' },
];
const FISHING_AUDIENCES: Array<{ value: Audience; title: string }> = [
  { value: 'new_anglers', title: 'New anglers' },
  { value: 'weekend_anglers', title: 'Weekend anglers' },
  { value: 'serious_anglers', title: 'Serious anglers' },
  { value: 'local_crews', title: 'Local crews' },
];
const ANGLES: Array<{ value: Angle; title: string; copy: string }> = [
  { value: 'relatable', title: 'Relatable', copy: 'A gym thought, confession or question.' },
  { value: 'problem_solution', title: 'Problem → proof', copy: 'A real frustration resolved by the product.' },
  { value: 'proof', title: 'Product proof', copy: 'Lead with the capability itself.' },
  { value: 'routine', title: 'Daily routine', copy: 'The app appears as the natural next action.' },
];

function stateLabel(state: Mission['status']) {
  return state === 'awaiting_review' ? 'READY FOR YOUR REVIEW' : state.replace('_', ' ').toUpperCase();
}

function preferredFeatures(library: FeatureReadiness[], count: number) {
  return [...library.filter((feature) => feature.uploaded), ...library.filter((feature) => !feature.uploaded)]
    .slice(0, count)
    .map((feature) => feature.key);
}

export default function PromotionMission() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedApp = searchParams.get('app');
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [appSlug, setAppSlug] = useState(requestedApp === 'cast' ? 'cast' : 'deadset');
  const [accountId, setAccountId] = useState('');
  const [goal, setGoal] = useState<Goal>('downloads');
  const [audience, setAudience] = useState<Audience>('consistent_lifters');
  const [angle, setAngle] = useState<Angle>('relatable');
  const [format, setFormat] = useState<ContentFormat>('photo_carousel');
  const [count, setCount] = useState(3);
  const [features, setFeatures] = useState<string[]>([]);
  const [autoProduce, setAutoProduce] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);

  const refresh = useCallback(async () => {
    const [nextReadiness, missionData] = await Promise.all([
      api<Readiness>('/promotion/readiness'),
      api<{ missions: Mission[] }>('/promotion/missions'),
    ]);
    setReadiness(nextReadiness);
    setMissions(missionData.missions);
    setFeatures((current) => current.length ? current : preferredFeatures(nextReadiness.feature_libraries[appSlug] ?? [], count));
  }, [appSlug, count]);

  useEffect(() => {
    refresh().catch((error) => setMessage({ tone: 'bad', text: error.message }));
    const timer = window.setInterval(() => refresh().catch(() => undefined), 3500);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const selectedApp = useMemo(() => readiness?.apps.find((app) => app.slug === appSlug) ?? null, [appSlug, readiness]);
  const eligibleAccounts = useMemo(() => readiness?.accounts.filter((account) =>
    account.status === 'connected' && (!account.app_id || account.app_id === selectedApp?.id)) ?? [], [readiness, selectedApp?.id]);
  const featureLibrary = readiness?.feature_libraries[appSlug] ?? [];
  const audienceOptions = selectedApp?.content_domain === 'fishing' ? FISHING_AUDIENCES : FITNESS_AUDIENCES;
  const selectedAssetsReady = features.length > 0 && features.every((key) => selectedApp?.uploaded_feature_keys.includes(key));
  const selectedProductionReady = Boolean(selectedApp?.producer_available && selectedApp.photo_source_ready && selectedAssetsReady);
  const productionStatus = !selectedApp?.producer_available
    ? 'Production agent needs attention'
    : !selectedAssetsReady
      ? 'Finish the selected screens in Creative Studio'
      : !selectedApp.photo_source_ready
        ? 'Connect the free Pexels source in Creative Studio'
        : 'Licensed source + selected exact screens ready';
  const appMissions = missions.filter((mission) => mission.app_id === selectedApp?.id).slice(0, 5);
  const canLaunch = Boolean(selectedApp?.drafting_ready && !busy);

  function chooseApp(slug: string) {
    setAppSlug(slug);
    setSearchParams({ app: slug }, { replace: true });
    setAccountId('');
    setFeatures(preferredFeatures(readiness?.feature_libraries[slug] ?? [], count));
    setAudience(slug === 'cast' ? 'weekend_anglers' : 'consistent_lifters');
    setFormat('photo_carousel');
    setAutoProduce(true);
  }

  function toggleFeature(key: string) {
    setFeatures((current) => current.includes(key)
      ? current.filter((item) => item !== key)
      : current.length < count ? [...current, key] : current);
  }

  async function launch(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await api('/promotion/missions', {
        method: 'POST',
        body: JSON.stringify({
          app_slug: appSlug, account_id: accountId || null, goal, audience, angle,
          content_format: format, draft_count: count,
          feature_rotation: format === 'photo_carousel' ? features : [],
          auto_produce: format === 'photo_carousel' && autoProduce && selectedProductionReady,
        }),
      });
      setMessage({ tone: 'ok', text: `Mission launched. ${count} original concept${count === 1 ? '' : 's'} will return here and to your review queue—nothing will publish without you.` });
      await refresh();
    } catch (error) {
      setMessage({ tone: 'bad', text: error instanceof Error ? error.message : 'Mission could not launch.' });
    } finally { setBusy(false); }
  }

  return (
    <div className="ops-page promote-page">
      <div className="ops-grid-plane" aria-hidden="true" />
      <header className="promote-hero">
        <div>
          <p className="ops-eyebrow"><i /> J.A.R.V.I.S. // PROMOTION MISSION</p>
          <h2>Tell the system what outcome you want.</h2>
          <p>It turns that into native TikTok concepts, exact product proof and a review-ready handoff.</p>
        </div>
        <div className="promote-safety"><span>AUTHORITY LOCK</span><b>OWNER REVIEW REQUIRED</b><p>Drafting and production can run. Publishing cannot bypass you.</p></div>
      </header>

      {message && <div className={`ops-alert ${message.tone}`}>{message.text}</div>}

      <form className="mission-layout" onSubmit={launch}>
        <div className="mission-builder">
          <section className="mission-panel">
            <div className="mission-heading"><b>01</b><div><span>TARGET</span><h3>Which app are we promoting?</h3></div></div>
            <div className="mission-apps">
              {readiness?.apps.map((app) => (
                <button type="button" aria-pressed={app.slug === appSlug} className={app.slug === appSlug ? 'selected' : ''} onClick={() => chooseApp(app.slug)} key={app.id}>
                  <i style={{ background: app.accent }} /><strong>{app.name}</strong><small>{app.pending_drafts} waiting</small>
                </button>
              ))}
            </div>
          </section>

          <section className="mission-panel">
            <div className="mission-heading"><b>02</b><div><span>OBJECTIVE</span><h3>What should this batch achieve?</h3></div></div>
            <div className="mission-choice-grid goals">
              {GOALS.map((item) => <button type="button" aria-pressed={goal === item.value} className={goal === item.value ? 'selected' : ''} onClick={() => setGoal(item.value)} key={item.value}><strong>{item.title}</strong><small>{item.copy}</small></button>)}
            </div>
          </section>

          <section className="mission-panel twin">
            <div>
              <div className="mission-heading"><b>03</b><div><span>AUDIENCE</span><h3>Who is it for?</h3></div></div>
              <div className="mission-chip-row">{audienceOptions.map((item) => <button type="button" aria-pressed={audience === item.value} className={audience === item.value ? 'selected' : ''} onClick={() => setAudience(item.value)} key={item.value}>{item.title}</button>)}</div>
            </div>
            <div>
              <div className="mission-heading"><b>04</b><div><span>ANGLE</span><h3>How should it feel?</h3></div></div>
              <div className="mission-choice-grid compact">{ANGLES.map((item) => <button type="button" aria-pressed={angle === item.value} className={angle === item.value ? 'selected' : ''} onClick={() => setAngle(item.value)} key={item.value}><strong>{item.title}</strong><small>{item.copy}</small></button>)}</div>
            </div>
          </section>

          <section className="mission-panel">
            <div className="mission-heading"><b>05</b><div><span>CREATIVE ROUTE</span><h3>What should the agents make?</h3></div></div>
            <div className="format-grid">
              <button type="button" aria-pressed={format === 'photo_carousel'} className={format === 'photo_carousel' ? 'selected' : ''} onClick={() => { setFormat('photo_carousel'); setAutoProduce(true); }}><strong>Native photo carousel</strong><small>Real licensed lifestyle image → exact {selectedApp?.name ?? 'app'} feature proof. Can be produced automatically when the selected screens are ready.</small></button>
              <button type="button" aria-pressed={format === 'video_brief'} className={format === 'video_brief' ? 'selected' : ''} onClick={() => { setFormat('video_brief'); setAutoProduce(false); }}><strong>Shoot-ready video brief</strong><small>12–20 second timestamped beat sheet: footage, speech, screen action, caption, sound and purpose.</small></button>
            </div>

            {format === 'photo_carousel' && <div className="feature-selector"><span>ROTATE EXACT {selectedApp?.name.toUpperCase()} PROOF · CHOOSE UP TO {count}</span><div>{featureLibrary.map((feature) => <button type="button" aria-pressed={features.includes(feature.key)} className={features.includes(feature.key) ? 'selected' : ''} onClick={() => toggleFeature(feature.key)} key={feature.key}><i className={feature.uploaded ? 'ready' : ''} /> {feature.label}</button>)}</div></div>}

            <div className="mission-controls">
              <label>CONCEPTS<select value={count} onChange={(event) => { const next = Number(event.target.value); setCount(next); setFeatures((current) => current.slice(0, next)); }}>{[1, 2, 3, 4, 5, 6].map((value) => <option value={value} key={value}>{value}</option>)}</select></label>
              <label>TIKTOK DESTINATION<select value={accountId} onChange={(event) => setAccountId(event.target.value)}><option value="">Draft without an account</option>{eligibleAccounts.map((account) => <option value={account.id} key={account.id}>@{account.handle}{account.display_name ? ` · ${account.display_name}` : ''}</option>)}</select></label>
              {format === 'photo_carousel' && <label className="switch-row"><input type="checkbox" disabled={!selectedProductionReady} checked={autoProduce && selectedProductionReady} onChange={(event) => setAutoProduce(event.target.checked)} /><span>{selectedProductionReady ? 'Produce slides after drafting' : productionStatus}</span></label>}
            </div>
          </section>
        </div>

        <aside className="mission-sidebar">
          <section className="mission-status-card">
            <span>PRE-FLIGHT // {selectedApp?.name.toUpperCase() ?? 'LOADING'}</span><h3>System readiness</h3>
            <div className="readiness-line"><i className={selectedApp?.drafting_ready ? 'ready' : ''} /><div><b>Creative intelligence</b><small>{selectedApp?.drafting_ready ? `Truth-locked playbook ${selectedApp.playbook_version}` : 'Drafting needs attention'}</small></div></div>
            <div className="readiness-line"><i className={selectedProductionReady ? 'ready' : ''} /><div><b>Automatic production</b><small>{format === 'video_brief' ? 'Not required for a shoot brief' : productionStatus}</small></div></div>
            <div className="readiness-line"><i className={selectedApp?.publishing_ready ? 'ready' : ''} /><div><b>TikTok delivery</b><small>{selectedApp?.publishing_ready ? 'Publishing agent and account ready' : 'Drafting still works; connect an account later'}</small></div></div>
            <div className="readiness-line locked"><i /><div><b>Owner approval lock</b><small>Always active. No autonomous publishing.</small></div></div>
            {selectedApp?.blockers.length ? <div className="mission-blockers"><b>WHAT IS STILL MISSING</b>{selectedApp.blockers.map((blocker) => <p key={blocker}>— {blocker}</p>)}</div> : null}
            <div className="mission-shortcuts"><Link to="/studio">OPEN STUDIO</Link><Link to="/accounts">OPEN ACCOUNTS</Link></div>
          </section>

          <section className="launch-card">
            <span>MISSION SUMMARY</span><h3>{count} × {format === 'photo_carousel' ? 'native carousels' : 'shoot-ready briefs'}</h3>
            <p>{GOALS.find((item) => item.value === goal)?.title} · {audienceOptions.find((item) => item.value === audience)?.title} · {ANGLES.find((item) => item.value === angle)?.title}</p>
            <ul><li>Original hooks, not copied creator wording</li><li>Real or properly licensed visuals only</li><li>Exact app proof; no fake results or UI</li><li>Stops in review before TikTok</li></ul>
            <button className="mission-launch" disabled={!canLaunch}>{busy ? 'LAUNCHING…' : canLaunch ? 'LAUNCH PROMOTION MISSION' : 'DRAFTING NOT READY'}</button>
          </section>

          <section className="mission-stream">
            <div><span>RECENT MISSIONS</span><Link to="/queue">REVIEW QUEUE →</Link></div>
            {appMissions.length ? appMissions.map((mission) => <article key={mission.id}><i className={mission.status} /><div><b>{mission.draft_count} {mission.content_format === 'photo_carousel' ? 'carousels' : 'video briefs'}</b><small>{new Date(mission.created_at).toLocaleString()}</small>{mission.error && <em>{mission.error}</em>}</div><span>{stateLabel(mission.status)}</span></article>) : <p className="empty">No promotion missions for this app yet.</p>}
          </section>
        </aside>
      </form>
    </div>
  );
}
