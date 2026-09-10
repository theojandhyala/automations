import { describe, it, expect } from "vitest";
import {
  parseSalesReport,
  importSchema,
  periodTotal,
} from "../src/lib/hq-metrics";
const settings = {
  apple_app_id: "123456789",
  sku: "CastSKU",
  vendor_number: "12345678",
};
const header =
  "Apple Identifier\tSKU\tParent Identifier\tProduct Type Identifier\tUnits\tDeveloper Proceeds\tCurrency of Proceeds\tCMB";
describe("App HQ source accounting", () => {
  it("separates app units, re-downloads, updates, refunds and currency proceeds", () => {
    const report = [
      header,
      "123456789\tCastSKU\t\t1F\t10\t0\tGBP\t",
      "123456789\tCastSKU\t\t3F\t4\t0\tGBP\t",
      "123456789\tCastSKU\t\t7F\t100\t0\tGBP\t",
      "555\tMonthly\tCastSKU\tIAY\t2\t3.5\tGBP\t",
      "556\tAnnual\tCastSKU\tIAY\t1\t20\tUSD\t",
      "555\tMonthly\tCastSKU\tIAY\t-1\t3.5\tGBP\t",
      "999\tOther\tOtherSKU\t1F\t500\t10\tGBP\t",
    ].join("\n");
    expect(parseSalesReport(report, settings, "2026-09-01")).toMatchObject({
      downloads: 10,
      redownloads: 4,
      refunds: 1,
      proceeds: { GBP: 3.5, USD: 20 },
    });
  });
  it("does not count bundle credits as refunds", () => {
    expect(
      parseSalesReport(
        header + "\n123456789\tCastSKU\t\t1F\t-2\t1\tGBP\tCMB-C",
        settings,
        "2026-09-01",
      ).refunds,
    ).toBe(0);
  });
  it("rejects malformed reports instead of presenting zero", () => {
    expect(() =>
      parseSalesReport("Units\n12", settings, "2026-09-01"),
    ).toThrow();
  });
  it("does not total missing days or unknown values", () => {
    expect(
      periodTotal([{ date: "2026-09-01", downloads: 5 }], "downloads", 7),
    ).toBeNull();
    expect(
      periodTotal([{ date: "2026-09-01", downloads: 0 }], "downloads", 1),
    ).toBe(0);
  });
  it("rejects invalid dates, repeated days and mixed provider fields", () => {
    const base = {
      app: "cast",
      source: "product_export",
      description: "Verified product activity",
    };
    expect(
      importSchema.safeParse({
        ...base,
        days: [{ date: "2026-02-30", actions: 1 }],
      }).success,
    ).toBe(false);
    expect(
      importSchema.safeParse({
        ...base,
        days: [
          { date: "2026-09-01", actions: 1 },
          { date: "2026-09-01", actions: 2 },
        ],
      }).success,
    ).toBe(false);
    expect(
      importSchema.safeParse({
        ...base,
        days: [{ date: "2026-09-01", mrr_gbp: 10 }],
      }).success,
    ).toBe(false);
    expect(
      importSchema.safeParse({
        ...base,
        days: [{ date: "2026-09-01", retention_d7: 101 }],
      }).success,
    ).toBe(false);
  });
  it("preserves explicit zero, unknown and verified report provenance", () => {
    expect(
      importSchema.parse({
        app: "deadset",
        source: "product_export",
        description: "Verified daily activity",
        days: [{ date: "2026-09-01", actions: 0, active_users: null }],
      }).days[0],
    ).toEqual({ date: "2026-09-01", actions: 0, active_users: null });
  });
});

import { reportedTotal } from "../src/lib/hq-metrics";
it("distinguishes missing downloads, true zero and incomplete positive subtotals", () => {
  expect(reportedTotal([{ date: "2026-09-01" }], "downloads")).toMatchObject({
    value: null,
    received: 0,
    complete: false,
  });
  expect(
    reportedTotal([{ date: "2026-09-01", downloads: 0 }], "downloads"),
  ).toMatchObject({ value: 0, received: 1, complete: true });
  expect(
    reportedTotal(
      [{ date: "2026-09-01", downloads: 13 }, { date: "2026-09-02" }],
      "downloads",
    ),
  ).toMatchObject({ value: 13, received: 1, expected: 2, complete: false });
});
it("rejects a mismatched app SKU or report date instead of silently importing misleading totals", () => {
  expect(() =>
    parseSalesReport(
      header + "\n123456789\tWrongSKU\t\t1F\t10\t0\tGBP\t",
      settings,
      "2026-09-01",
    ),
  ).toThrow("SKU");
  expect(() =>
    parseSalesReport(
      header +
        "\tBegin Date\tEnd Date\n123456789\tCastSKU\t\t1F\t10\t0\tGBP\t\t09/02/2026\t09/02/2026",
      settings,
      "2026-09-01",
    ),
  ).toThrow("date");
});

import { appleConfirmsNoSales } from "../src/lib/hq-metrics";
it("accepts only Apple explicit no-sales confirmation as zero activity", () => {
  const noSales = {
    errors: [
      {
        code: "NOT_FOUND",
        detail: "There were no sales for the date specified.",
      },
    ],
  };
  expect(appleConfirmsNoSales(404, noSales)).toBe(true);
  expect(appleConfirmsNoSales(403, noSales)).toBe(false);
  expect(
    appleConfirmsNoSales(404, {
      errors: [{ code: "NOT_FOUND", detail: "Report not yet available" }],
    }),
  ).toBe(false);
  expect(appleConfirmsNoSales(404, null)).toBe(false);
});
