import type { Env } from "../types";
import type { HqApp } from "./hq-metrics";
import { boundedText } from "./hq-apple";
const CHARTS = [
  "mrr",
  "actives",
  "trials",
  "customers_active",
  "actives_new",
  "refund_rate",
  "trial_conversion_rate",
  "subscription_status",
] as const;
export async function refreshBillingCharts(
  env: Env,
  app: HqApp,
  project: string,
  key: string,
) {
  const storageKey = `${app}/billing/charts`;
  const old = await env.HQ_DATA.get<{
    captured_at: string;
    charts: Record<string, unknown>;
    errors: Record<string, string>;
  }>(storageKey, "json");
  if (old && Date.now() - Date.parse(old.captured_at) < 3600000) return;
  async function get(path: string) {
    const res = await fetch(
      `https://api.revenuecat.com/v2/projects/${project}/${path}`,
      {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(20000),
        redirect: "manual",
      },
    );
    if (!res.ok) {
      await res.body?.cancel();
      throw new Error(`RevenueCat chart reporting (${res.status})`);
    }
    return JSON.parse(await boundedText(res.body, 2000000));
  }
  const charts: Record<string, unknown> = { ...old?.charts },
    errors: Record<string, string> = {};
  const start = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10),
    end = new Date().toISOString().slice(0, 10);
  // Bound concurrency and stay below the project's 25 requests/minute allowance.
  for (const name of CHARTS) {
    try {
      const options = await get(`charts/${name}/options`);
      const day = options.resolutions?.find(
        (r: { id: string; display_name: string }) =>
          /^(day|daily)$/i.test(r.display_name),
      );
      if (!day) throw new Error("Provider does not offer daily resolution");
      const query = new URLSearchParams({
        currency: "GBP",
        resolution: String(day.id),
        start_date: start,
        end_date: end,
      });
      charts[name] = {
        ...(await get(`charts/${name}?${query}`)),
        collected_at: new Date().toISOString(),
      };
    } catch (e) {
      errors[name] = e instanceof Error ? e.message : "Chart collection failed";
    }
  }
  await env.HQ_DATA.put(
    storageKey,
    JSON.stringify({ captured_at: new Date().toISOString(), charts, errors }),
  );
}

import { z } from "zod";
import type { BillingCharts } from "./hq-contract";
import type { HqDay } from "./hq-metrics";
const chartSchema = z.object({
  display_name: z.string(),
  description: z.string(),
  resolution: z.literal("day"),
  yaxis_currency: z.literal("GBP"),
  collected_at: z.string().optional(),
  measures: z.array(
    z.object({
      display_name: z.string(),
      description: z.string(),
      unit: z.string(),
    }),
  ),
  values: z.array(
    z.object({
      cohort: z.number().int().optional(),
      measure: z.number().int().nonnegative(),
      value: z.number().finite().nullable(),
      incomplete: z.boolean().optional(),
    }),
  ),
});
export function normalizeBillingCharts(raw: unknown): BillingCharts | null {
  const root = z
    .object({
      captured_at: z.string(),
      charts: z.record(z.unknown()),
      errors: z.record(z.string()),
    })
    .safeParse(raw);
  if (!root.success) return null;
  const result: BillingCharts = {
    captured_at: root.data.captured_at,
    charts: [],
    errors: { ...root.data.errors },
  };
  for (const [id, rawChart] of Object.entries(root.data.charts)) {
    const parsed = chartSchema.safeParse(rawChart);
    if (!parsed.success) {
      result.errors[id] = "Provider chart format changed; values unavailable";
      continue;
    }
    const c = parsed.data;
    if (c.values.some((v) => !c.measures[v.measure])) {
      result.errors[id] = "Unrecognised chart measure";
      continue;
    }
    result.charts.push({
      id,
      title: c.display_name,
      description: c.description,
      captured_at: c.collected_at ?? root.data.captured_at,
      series: c.measures.map((m, i) => ({
        label: m.display_name,
        description: m.description,
        unit: m.unit,
        current:
          c.values.find((v) => v.measure === i && v.cohort === undefined)
            ?.value ?? null,
        points: c.values
          .filter(
            (v) =>
              v.measure === i &&
              v.cohort !== undefined &&
              v.cohort >= 946684800 &&
              v.cohort <= Date.now() / 1000,
          )
          .map((v) => ({
            date: new Date(v.cohort! * 1000).toISOString().slice(0, 10),
            value: v.incomplete ? null : v.value,
          })),
      })),
    });
  }
  return result;
}
export function billingChartDays(charts: BillingCharts | null): HqDay[] {
  const days = new Map<string, HqDay>();
  const mappings = [
    ["mrr", "MRR", "mrr_gbp"],
    ["actives", "Actives", "subscribers"],
    ["trials", "Active Trials", "trials"],
    ["actives_new", "Total Paid Subscriptions", "new_subscribers"],
    ["refund_rate", "Refunded Transactions", "refunds"],
  ] as const;
  for (const [id, measure, field] of mappings) {
    const series = charts?.charts
      .find((c) => c.id === id)
      ?.series.find((s) => s.label === measure);
    for (const p of series?.points ?? [])
      if (p.value !== null)
        days.set(p.date, {
          ...days.get(p.date),
          date: p.date,
          [field]: p.value,
        });
  }
  return [...days.values()];
}
