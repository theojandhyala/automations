import { refreshBillingCharts } from "./hq-billing-charts";
import { z } from "zod";
import { decrypt, encrypt } from "./crypto";
import { boundedText } from "./hq-apple";
import type { Env } from "../types";
import type { HqApp, HqDay } from "./hq-metrics";
import type { BillingSnapshot } from "./hq-contract";
export const RC_PROJECTS = {
  deadset: "proj5b7d0e8f",
  cast: "proj574142f9",
} as const;
export const billingKeySchema = z
  .object({ key: z.string().regex(/^sk_[A-Za-z0-9_-]{20,200}$/) })
  .strict();
const overviewSchema = z.object({
  currency: z.literal("GBP"),
  metrics: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string(),
      unit: z.string(),
      period: z.string(),
      value: z.number().finite(),
      last_updated_at: z.number().nullable().optional(),
    }),
  ),
});
export function parseBillingOverview(
  raw: unknown,
  app: HqApp,
  at = new Date().toISOString(),
): BillingSnapshot {
  const result = overviewSchema.parse(raw);
  return {
    app,
    captured_at: at,
    project_id: RC_PROJECTS[app],
    currency: "GBP",
    metrics: result.metrics,
    days: [],
  };
}
export async function collectBilling(
  key: string,
  app: HqApp,
): Promise<BillingSnapshot> {
  const res = await fetch(
    `https://api.revenuecat.com/v2/projects/${RC_PROJECTS[app]}/metrics/overview?currency=GBP`,
    {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(20000),
      redirect: "manual",
    },
  );
  if (!res.ok) {
    await res.body?.cancel();
    throw new Error(
      `RevenueCat reporting rejected (${res.status}). The key needs Charts & Metrics read access for ${app.toUpperCase()}.`,
    );
  }
  return parseBillingOverview(
    JSON.parse(await boundedText(res.body, 500000)),
    app,
  );
}
async function store(env: Env, app: HqApp, s: BillingSnapshot) {
  const existing = await env.HQ_DATA.get<BillingSnapshot>(
    `${app}/billing/current`,
    "json",
  );
  const today = s.captured_at.slice(0, 10),
    get = (id: string) => s.metrics.find((m) => m.id === id)?.value;
  const day: HqDay = { date: today };
  const mrr = get("mrr"),
    subs = get("active_subscriptions"),
    trials = get("active_trials");
  if (mrr !== undefined) day.mrr_gbp = mrr;
  if (subs !== undefined) day.subscribers = subs;
  if (trials !== undefined) day.trials = trials;
  s.days = [
    ...(existing?.days ?? []).filter((d) => d.date !== today).slice(-365),
    day,
  ];
  await env.HQ_DATA.put(`${app}/billing/current`, JSON.stringify(s));
  await env.HQ_DATA.put(
    `${app}/billing/status`,
    JSON.stringify({ at: s.captured_at, status: "connected", error: null }),
  );
}
export async function connectBilling(env: Env, app: HqApp, key: string) {
  const snapshot = await collectBilling(key, app);
  await env.HQ_DATA.put(
    `${app}/billing-key`,
    await encrypt(key, env.TOKEN_ENCRYPTION_KEY),
  );
  await store(env, app, snapshot);
  return snapshot;
}
export async function refreshBilling(env: Env, app: HqApp, force = false) {
  const encrypted = await env.HQ_DATA.get(`${app}/billing-key`);
  if (!encrypted) return { status: "not_connected" };
  const old = await env.HQ_DATA.get<BillingSnapshot>(
    `${app}/billing/current`,
    "json",
  );
  if (!force && old && Date.now() - Date.parse(old.captured_at) < 5 * 60000)
    return { status: "cached", at: old.captured_at };
  try {
    const key = await decrypt(encrypted, env.TOKEN_ENCRYPTION_KEY);
    const s = await collectBilling(key, app);
    await store(env, app, s);
    await refreshBillingCharts(env, app, RC_PROJECTS[app], key);
    return { status: "connected", at: s.captured_at };
  } catch (e) {
    const error = e instanceof Error ? e.message : "Billing sync failed";
    await env.HQ_DATA.put(
      `${app}/billing/status`,
      JSON.stringify({ at: new Date().toISOString(), status: "error", error }),
    );
    return { status: "error", error };
  }
}
