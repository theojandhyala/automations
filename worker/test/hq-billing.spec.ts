import { describe, it, expect } from "vitest";
import { parseBillingOverview, billingKeySchema } from "../src/lib/hq-billing";
const metric = {
  id: "active_trials",
  name: "Active trials",
  description: "Current trials",
  unit: "#",
  period: "P0D",
  value: 0,
  last_updated_at: 1789000000000,
};
describe("RevenueCat reporting contract", () => {
  it("preserves real zero values and provider freshness without inventing history", () => {
    const result = parseBillingOverview(
      { currency: "GBP", metrics: [metric] },
      "cast",
      "2026-09-10T20:00:00Z",
    );
    expect(result.project_id).toBe("proj574142f9");
    expect(result.metrics[0]).toEqual(metric);
    expect(result.days).toEqual([]);
  });
  it("rejects wrong currencies and missing numeric values instead of labelling them GBP or zero", () => {
    expect(() =>
      parseBillingOverview({ currency: "USD", metrics: [metric] }, "deadset"),
    ).toThrow();
    expect(() =>
      parseBillingOverview(
        { currency: "GBP", metrics: [{ ...metric, value: null }] },
        "deadset",
      ),
    ).toThrow();
    expect(billingKeySchema.safeParse({ key: "appl_public-key" }).success).toBe(
      false,
    );
  });
});

import {
  normalizeBillingCharts,
  billingChartDays,
} from "../src/lib/hq-billing-charts";
it("maps chart measures by metadata and excludes incomplete days", () => {
  const charts = normalizeBillingCharts({
    captured_at: "2026-09-10T20:00:00Z",
    errors: {},
    charts: {
      actives_new: {
        display_name: "New subscriptions",
        description: "Daily",
        resolution: "day",
        yaxis_currency: "GBP",
        measures: [
          {
            display_name: "Trial Conversions",
            description: "Trials",
            unit: "#",
          },
          {
            display_name: "Total Paid Subscriptions",
            description: "All",
            unit: "#",
          },
        ],
        values: [
          { cohort: 1788912000, measure: 0, value: 2 },
          { cohort: 1788912000, measure: 1, value: 5 },
          { cohort: 1788998400, measure: 1, value: 3, incomplete: true },
        ],
      },
    },
  });
  expect(billingChartDays(charts)).toEqual([
    { date: "2026-09-09", new_subscribers: 5 },
  ]);
});
it("keeps unsupported or wrong-currency chart data unavailable", () => {
  const result = normalizeBillingCharts({
    captured_at: "2026-09-10T20:00:00Z",
    errors: {},
    charts: {
      mrr: { resolution: "month", yaxis_currency: "USD", values: [[1, 2]] },
    },
  });
  expect(result?.charts).toEqual([]);
  expect(result?.errors.mrr).toBeTruthy();
});
