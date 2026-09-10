import type { Env } from '../types';
import type { HqApp } from './hq-metrics';
import { boundedText } from './hq-apple';
const CHARTS = ['mrr', 'actives', 'trials', 'customers_active', 'actives_new', 'refund_rate', 'trial_conversion_rate', 'subscription_status'] as const;
export async function refreshBillingCharts(env: Env, app: HqApp, project: string, key: string) {
  const storageKey = `${app}/billing/charts`;
  const old = await env.HQ_DATA.get<{ captured_at: string; charts: Record<string, unknown>; errors: Record<string, string> }>(storageKey, 'json');
  if (old && Date.now() - Date.parse(old.captured_at) < 3600000) return;
  async function get(path: string) {
    const res = await fetch(`https://api.revenuecat.com/v2/projects/${project}/${path}`, {
      headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(20000), redirect: 'manual',
    });
    if (!res.ok) { await res.body?.cancel(); throw new Error(`RevenueCat chart reporting (${res.status})`); }
    return JSON.parse(await boundedText(res.body, 2000000));
  }
  const charts: Record<string, unknown> = { ...old?.charts }, errors: Record<string, string> = {};
  const start = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10), end = new Date().toISOString().slice(0, 10);
  // Bound concurrency and stay below the project's 25 requests/minute allowance.
  for (const name of CHARTS) {
    try {
      const options = await get(`charts/${name}/options`);
      const day = options.resolutions?.find((r: { id: string; display_name: string }) => /^(day|daily)$/i.test(r.display_name));
      if (!day) throw new Error('Provider does not offer daily resolution');
      const query = new URLSearchParams({ currency: 'GBP', resolution: String(day.id), start_date: start, end_date: end });
      charts[name] = await get(`charts/${name}?${query}`);
    } catch (e) { errors[name] = e instanceof Error ? e.message : 'Chart collection failed'; }
  }
  await env.HQ_DATA.put(storageKey, JSON.stringify({ captured_at: new Date().toISOString(), charts, errors }));
}
