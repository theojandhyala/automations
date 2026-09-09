import { z } from 'zod';

const count = z.number().int().nonnegative().max(1_000_000_000);
export const baselineSchema = z.object({
  version: z.literal(1),
  captured_at: z.string().datetime(),
  window_start: z.string().datetime(),
  source: z.literal('deadset_supabase'),
  coverage: z.literal('synced_workouts_and_stripe_only'),
  registered_users: count,
  synced_users: count,
  signups_7d: count,
  workout_active_24h: count,
  workout_active_7d: count,
  workouts_7d: count,
  completed_workouts: count,
  first_workout_users: count,
  second_workout_users: count,
  stripe_active_subscribers: count,
  stripe_trial_subscribers: count,
  stripe_cancelling_subscribers: count,
  stripe_unknown_expiry: count,
  excluded_sandbox_subscriptions: count,
  invalid_workout_records: count,
  orphan_state_records: count,
  sources: z.array(z.object({ source: z.string().max(80), users: count, first_workout_users: count, second_workout_users: count }).strict()).max(200),
}).strict().superRefine((s, ctx) => {
  const reject = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  if (Date.parse(s.captured_at) - Date.parse(s.window_start) !== 7 * 86400000) reject('Window must be exactly 7 days');
  if (s.synced_users > s.registered_users || s.signups_7d > s.registered_users) reject('User counts exceed registered users');
  if (s.second_workout_users > s.first_workout_users || s.first_workout_users > s.synced_users) reject('Invalid workout funnel');
  if (s.workout_active_24h > s.workout_active_7d || s.workout_active_7d > s.first_workout_users) reject('Invalid activity counts');
  if (s.workouts_7d > s.completed_workouts || s.workouts_7d < s.workout_active_7d) reject('Invalid workout counts');
  if (s.sources.reduce((n, row) => n + row.users, 0) !== s.registered_users) reject('Sources must cover registered users');
  if (new Set(s.sources.map(row => row.source)).size !== s.sources.length) reject('Duplicate source');
  if (s.sources.some(row => row.second_workout_users > row.first_workout_users || row.first_workout_users > row.users)) reject('Invalid source funnel');
  if (s.sources.reduce((n, r) => n + r.first_workout_users, 0) !== s.first_workout_users || s.sources.reduce((n, r) => n + r.second_workout_users, 0) !== s.second_workout_users) reject('Source funnel totals disagree');
  if (s.stripe_cancelling_subscribers > s.stripe_active_subscribers) reject('Cancelling exceeds active');
});
export type DeadsetBaseline = z.infer<typeof baselineSchema>;
type Profile = { id: string; created_at: string };
type State = { user_id: string; sessions?: unknown; attribution?: unknown };
type Subscription = { user_id: string; status: string; environment: string; current_period_end: string | null; cancel_at_period_end: boolean };
const object = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const stamp = (v: unknown) => typeof v === 'string' ? Date.parse(v) : NaN;

/** Aggregate persisted state, not app opens. Never output identities or workout details. */
export function calculateBaseline(profiles: Profile[], states: State[], subscriptions: Subscription[], now: Date): DeadsetBaseline {
  const end = now.getTime();
  const start = end - 7 * 86400000;
  const known = new Set(profiles.map(p => p.id));
  if (known.size !== profiles.length) throw new Error('Duplicate profile IDs');
  const seenStates = new Set<string>();
  const activity = new Map<string, number[]>();
  const attribution = new Map<string, string>();
  let invalid = 0, orphans = 0;
  for (const row of states) {
    if (!known.has(row.user_id)) { orphans++; continue; }
    if (seenStates.has(row.user_id)) throw new Error('Duplicate state IDs');
    seenStates.add(row.user_id);
    const source = object(row.attribution)?.source;
    attribution.set(row.user_id, typeof source === 'string' && /^[a-zA-Z0-9._-]{1,80}$/.test(source) ? source.toLowerCase() : 'unattributed');
    if (row.sessions != null && !Array.isArray(row.sessions)) { invalid++; continue; }
    const workouts = new Map<string, number>();
    for (const value of (row.sessions ?? []) as unknown[]) {
      const session = object(value);
      if (!session) { invalid++; continue; }
      if (!session.endedAt) continue;
      const time = stamp(session.endedAt);
      const began = stamp(session.startedAt);
      if (typeof session.id !== 'string' || !session.id || !Number.isFinite(time) || time > end || !Number.isFinite(began) || time < began) { invalid++; continue; }
      // Conservative deterministic handling of repeated sync records.
      workouts.set(session.id, Math.min(workouts.get(session.id) ?? time, time));
    }
    activity.set(row.user_id, [...workouts.values()]);
  }
  const sources = new Map<string, { source: string; users: number; first_workout_users: number; second_workout_users: number }>();
  for (const profile of profiles) {
    let key = attribution.get(profile.id) ?? 'unattributed';
    if (!sources.has(key) && sources.size >= 199) key = 'other';
    const source = sources.get(key) ?? { source: key, users: 0, first_workout_users: 0, second_workout_users: 0 };
    const n = activity.get(profile.id)?.length ?? 0;
    source.users++; source.first_workout_users += Number(n >= 1); source.second_workout_users += Number(n >= 2);
    sources.set(key, source);
  }
  const active = new Set<string>(), trial = new Set<string>(), cancelling = new Set<string>();
  let sandbox = 0, unknownExpiry = 0;
  for (const sub of subscriptions) {
    if (sub.environment !== 'live') { sandbox++; continue; }
    if (!['active', 'trialing', 'canceled'].includes(sub.status)) continue;
    const expires = stamp(sub.current_period_end);
    if (!Number.isFinite(expires)) { unknownExpiry++; continue; }
    if (expires <= end) continue;
    if (sub.status === 'trialing') trial.add(sub.user_id);
    else {
      active.add(sub.user_id);
      if (sub.cancel_at_period_end || sub.status === 'canceled') cancelling.add(sub.user_id);
    }
  }
  const times = [...activity.values()];
  return baselineSchema.parse({
    version: 1, captured_at: now.toISOString(), window_start: new Date(start).toISOString(), source: 'deadset_supabase', coverage: 'synced_workouts_and_stripe_only',
    registered_users: profiles.length, synced_users: seenStates.size,
    signups_7d: profiles.filter(p => stamp(p.created_at) >= start && stamp(p.created_at) <= end).length,
    workout_active_24h: times.filter(t => t.some(x => x >= end - 86400000)).length,
    workout_active_7d: times.filter(t => t.some(x => x >= start)).length,
    workouts_7d: times.reduce((sum, t) => sum + t.filter(x => x >= start).length, 0),
    completed_workouts: times.reduce((sum, t) => sum + t.length, 0),
    first_workout_users: times.filter(t => t.length >= 1).length, second_workout_users: times.filter(t => t.length >= 2).length,
    stripe_active_subscribers: active.size, stripe_trial_subscribers: trial.size,
    stripe_cancelling_subscribers: cancelling.size, stripe_unknown_expiry: unknownExpiry, excluded_sandbox_subscriptions: sandbox,
    invalid_workout_records: invalid, orphan_state_records: orphans, sources: [...sources.values()].sort((a, b) => b.users - a.users || a.source.localeCompare(b.source)),
  });
}
