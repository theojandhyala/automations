import { writeFile } from 'node:fs/promises';
import { calculateBaseline } from '../worker/src/lib/deadset-baseline.ts';

// Usage: node --experimental-strip-types --env-file=/path/to/deadset/.env scripts/collect-deadset-baseline.mjs /private/path/baseline.json
// Read-only against DEADSET. Only aggregate counts are written locally.
const origin = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const output = process.argv[2];
if (!origin || !key || !output) throw new Error('Source credentials and output path required');
const url = new URL(origin);
if (url.protocol !== 'https:' || !url.hostname.endsWith('.supabase.co')) throw new Error('Expected a hosted Supabase HTTPS origin');
async function all(table, select, order) {
  const rows = [];
  let total;
  while (true) {
    const query = new URLSearchParams({ select, order, offset: String(rows.length), limit: '200' });
    const res = await fetch(`${url.origin}/rest/v1/${table}?${query}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: 'count=exact' }, signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(`Source ${table} read failed (${res.status}); no baseline saved`);
    const currentTotal = Number(res.headers.get('content-range')?.split('/')[1]);
    if (!Number.isSafeInteger(currentTotal)) throw new Error(`Missing source coverage for ${table}`);
    if (total !== undefined && total !== currentTotal) throw new Error('Source changed during pagination; retry collection');
    total = currentTotal;
    const page = await res.json();
    if (!Array.isArray(page)) throw new Error('Invalid source response');
    rows.push(...page);
    if (rows.length === total) return rows;
    if (!page.length || rows.length > total || rows.length > 100000) throw new Error('Incomplete or oversized collection; no baseline saved');
  }
}
try {
  const [profiles, states, subscriptions] = await Promise.all([
    all('profiles', 'id,created_at', 'id.asc'),
    all('user_state', 'user_id,sessions:data->sessions,attribution:data->signupSource', 'user_id.asc'),
    all('subscriptions', 'user_id,status,environment,current_period_end,cancel_at_period_end', 'id.asc'),
  ]);
  const baseline = calculateBaseline(profiles, states, subscriptions, new Date());
  await writeFile(output, JSON.stringify(baseline, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  console.log(`Aggregate baseline saved: ${baseline.registered_users} registered users; ${baseline.synced_users} synced users. Coverage: synced workouts and Stripe only.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Baseline collection failed');
  process.exitCode = 1;
}
