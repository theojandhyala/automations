import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, supabase } from '../lib/supabase';
import { useData } from '../lib/useData';
import type { DeadsetBaseline } from '../../../worker/src/lib/deadset-baseline';
import type { Automation, Run } from '../lib/types';
import '../deadset-hq.css';

const metrics = ['Weekly installs', 'DAU', 'WAU', 'Workouts / active user', 'D1 retention', 'D7 retention', 'D30 retention', 'Free → trial', 'Trial → paid', 'Paying subscribers', 'MRR (GBP)', 'Monthly / annual mix', 'Subscriber churn', 'Content-attributed installs'];
const funnel = ['TikTok', 'Website / App Store', 'Install', 'Account', 'First workout', 'Second workout', 'Trial', 'Pro', 'Renewal'];
async function loadHQ() {
  const app = await supabase.from('apps').select('id').eq('slug', 'deadset').single();
  if (app.error) throw app.error;
  const [agents, drafts, posted, accounts] = await Promise.all([
    supabase.from('automations').select('*').eq('app_id', app.data.id).order('name'),
    supabase.from('artifacts').select('id', { count: 'exact', head: true }).eq('app_id', app.data.id).eq('status', 'draft'),
    supabase.from('artifacts').select('id', { count: 'exact', head: true }).eq('app_id', app.data.id).eq('status', 'published').gte('published_at', new Date(Date.now() - 7 * 86400000).toISOString()),
    supabase.from('tiktok_accounts_public').select('id,handle').eq('app_id', app.data.id),
  ]);
  for (const result of [agents, drafts, posted, accounts]) if (result.error) throw result.error;
  const automationRows = agents.data as Automation[];
  const runs = automationRows.length ? await supabase.from('runs').select('*').in('automation_id', automationRows.map(a => a.id)).eq('status', 'failed').order('started_at', { ascending: false }).limit(10) : { data: [], error: null };
  if (runs.error) throw runs.error;
  const snapshots = await Promise.all((accounts.data ?? []).map(async account => {
    const result = await supabase.from('analytics_snapshots').select('captured_at,quality,views_28d,followers').eq('account_id', account.id).order('captured_at', { ascending: false }).limit(1).maybeSingle();
    if (result.error) throw result.error;
    return { handle: account.handle, snapshot: result.data };
  }));
  let baseline: DeadsetBaseline | null = null;
  let baselineError: string | null = null;
  try { baseline = (await api<{ current: DeadsetBaseline | null }>('/deadset/baselines')).current; }
  catch (err) { baselineError = err instanceof Error ? err.message : 'Baseline unavailable'; }
  return { baseline, baselineError, agents: automationRows, drafts: drafts.count, posted: posted.count, runs: runs.data as Run[], snapshots, refreshed: new Date().toISOString() };
}
export default function DeadsetHQ() {
  const { data, error, refresh } = useData(loadHQ, [], 60000);
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  async function importBaseline(file: File) {
    if (file.size > 64000) { setMessage('Baseline file must be smaller than 64 KB.'); return; }
    setPending('import'); setMessage('');
    try {
      await api('/deadset/baselines', { method: 'POST', body: await file.text() });
      setMessage('Baseline saved.'); refresh();
    } catch (err) { setMessage(err instanceof Error ? err.message : 'Import failed'); }
    finally { setPending(null); }
  }
  const baseline = data?.baseline;
  async function toggle(agent: Automation) {
    setPending(agent.id); setMessage('');
    try { await api(`/automations/${agent.id}`, { method: 'PATCH', body: JSON.stringify({ enabled: !agent.enabled }) }); setMessage(`${agent.name} ${agent.enabled ? 'paused' : 'resumed'}.`); refresh(); }
    catch (err) { setMessage(err instanceof Error ? err.message : 'Unable to update automation.'); }
    finally { setPending(null); }
  }
  return <div className="deadset-hq">
    <header className="hq-header"><div><p className="hq-eyebrow">90-DAY FOCUS / DEADSET</p><h1>Know what drives growth.</h1><p>First target: 100 retained paying users.</p></div><button onClick={refresh}>Refresh data</button></header>
    <div className="hq-milestones" aria-label="Growth milestones">{['100 paying', '500 paying', '1,000 paying', '£10k MRR', '£25k MRR', '£50k MRR'].map(t => <span key={t}>{t}</span>)}</div>
    {error && <p role="alert" className="hq-warning">HQ could not refresh: {error}. Any displayed data is from the last successful refresh.</p>}
    <div className="hq-actions"><Link to="/queue">Review & approve posts →</Link><Link to="/promote">Create / regenerate a concept →</Link><Link to="/">Shared automation controls →</Link></div>
    <section className="hq-panel"><h2>Recorded baseline</h2>
      <p>Synced workout history and live Stripe subscriptions. Excludes RevenueCat, unsynced activity and App Store downloads.</p>
      <label className="hq-import">Import aggregate baseline JSON <input type="file" accept="application/json,.json" disabled={pending !== null} onChange={event => { const file = event.target.files?.[0]; if (file) void importBaseline(file); event.target.value = ''; }} /></label>
      <p role="status">{message}</p>
      {data?.baselineError && <p className="hq-warning">{data.baselineError}</p>}
      {!baseline ? <p>No stored baseline yet. Import the read-only collector’s aggregate JSON after the storage migration is released.</p> : <>
        <p>Captured {new Date(baseline.captured_at).toLocaleString()} · rolling seven days from {new Date(baseline.window_start).toLocaleString()}</p>
        {Date.now() - Date.parse(baseline.captured_at) > 48 * 3600000 && <p className="hq-warning">This baseline is more than 48 hours old. Collect a fresh snapshot before making current-growth decisions.</p>}
        <div className="hq-metrics">{[
          ['Registered profiles', baseline.registered_users], ['Synced profiles', baseline.synced_users], ['Signups / 7 days', baseline.signups_7d],
          ['Workout-active / 24 hours', baseline.workout_active_24h], ['Workout-active / 7 days', baseline.workout_active_7d], ['Completed workouts / 7 days', baseline.workouts_7d],
          ['Ever completed first workout', baseline.first_workout_users], ['Ever completed second workout', baseline.second_workout_users], ['Live Stripe subscribers', baseline.stripe_active_subscribers],
          ['Live Stripe trials', baseline.stripe_trial_subscribers], ['Stripe cancelling / still active', baseline.stripe_cancelling_subscribers], ['Completed workouts / all time', baseline.completed_workouts],
        ].map(([label, value]) => <article key={label}><span>{label}</span><strong>{value}</strong></article>)}</div>
        <p>Data checks: {baseline.orphan_state_records} unmatched saved states excluded · {baseline.invalid_workout_records} invalid workout records excluded · {baseline.excluded_sandbox_subscriptions} non-live subscription records excluded · {baseline.stripe_unknown_expiry} subscriptions with unknown expiry excluded.</p>
        <h3>Recorded first-touch sources</h3><div className="table-wrap"><table><thead><tr><th>Source</th><th>Profiles</th><th>First workout</th><th>Second workout</th></tr></thead><tbody>{baseline.sources.map(source => <tr key={source.source}><td>{source.source}</td><td>{source.users}</td><td>{source.first_workout_users}</td><td>{source.second_workout_users}</td></tr>)}</tbody></table></div>
        <p>All-time observed counts, not cohort conversion rates or causal attribution. Direct means no recognised campaign was stored.</p>
      </>}
    </section>
    <section className="hq-panel"><h2>Metrics awaiting full coverage</h2><p className="hq-warning">Product and subscription feeds are not connected to HQ yet. These values are unknown. No growth or revenue claim is inferred from TikTok views.</p><div className="hq-metrics">{metrics.map(label => <article key={label}><span>{label}</span><strong>—</strong><small>Awaiting verified source</small></article>)}</div></section>
    <section className="hq-panel"><h2>Acquisition → retention</h2><ol className="hq-funnel">{funnel.map(step => <li key={step}>{step}</li>)}</ol><p>Preserve campaign, account and content IDs where measurable. App Store transitions can lose identity; unlinked users remain unattributed.</p></section>
    <div className="hq-columns"><section className="hq-panel"><h2>Content operations</h2><p>{data ? `${data.drafts ?? '—'} drafts awaiting review · ${data.posted ?? '—'} posts published in the last 7 days` : 'Loading content operations…'}</p><p>Approve and schedule exact creative in the review queue. Shared publishing and analytics agents are managed in the command center.</p>{data?.agents.map(agent => <article className="hq-agent" key={agent.id}><div><strong>{agent.name}</strong><small>{agent.enabled ? agent.status : 'Paused'} · {agent.failure_streak} consecutive failures</small></div><button disabled={pending !== null} onClick={() => toggle(agent)}>{pending === agent.id ? 'Saving…' : agent.enabled ? 'Pause' : 'Resume'}</button></article>)}{data?.agents.length === 0 && <p>No DEADSET-specific automations found.</p>}</section>
    <section className="hq-panel"><h2>TikTok evidence</h2><p>Latest sampled-post lifetime views; these are not weekly views or installs.</p>{data?.snapshots.map(({ handle, snapshot }) => <article className="hq-agent" key={handle}><div><strong>@{handle}</strong><small>{snapshot ? `${snapshot.quality} · captured ${new Date(snapshot.captured_at).toLocaleString()}` : 'No snapshot collected'}</small></div><strong>{snapshot?.views_28d?.toLocaleString() ?? '—'} views</strong></article>)}{data?.snapshots.length === 0 && <p>No DEADSET accounts connected.</p>}</section></div>
    <section className="hq-panel"><h2>Recent automation errors</h2>{data?.runs.map(run => <article className="hq-error" key={run.id}><strong>{data.agents.find(a => a.id === run.automation_id)?.name}</strong><small>{new Date(run.started_at).toLocaleString()}</small><p>{run.error ?? 'Run failed without an error message.'}</p></article>)}{data?.runs.length === 0 && <p>No recorded failures for DEADSET-specific automations.</p>}</section>
    <section className="hq-panel"><h2>The next four weeks</h2><div className="hq-metrics">{[['01 / Measure', 'Connect product events, RevenueCat and App Store reports. Freeze the first baseline.'], ['02 / Activate', 'Measure first and second workout completion. Investigate the largest onboarding or subscription drop-off.'], ['03 / Experiment', 'Record one-variable content tests. Compare activation and subscribers alongside engagement.'], ['04 / Learn & ship', 'Interview active and lapsed users. Ship the highest-evidence improvement.']].map(([title, text]) => <article key={title}><h3>{title}</h3><p>{text}</p></article>)}</div></section>
    <footer>Monday: metrics · Tuesday: retention · Wednesday: content · Thursday: experiments · Friday: ship{data && <p>Last successful refresh: {new Date(data.refreshed).toLocaleString()}</p>}</footer>
  </div>;
}
