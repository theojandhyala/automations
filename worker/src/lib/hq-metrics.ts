import { z } from "zod";
export const appSlugSchema = z.enum(["deadset", "cast"]);
export type HqApp = z.infer<typeof appSlugSchema>;
const count = z.number().int().nonnegative().max(1e10).nullable().optional();
const rate = z.number().min(0).max(100).nullable().optional();
export const daySchema = z
  .object({
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine(
        (v) =>
          !Number.isNaN(Date.parse(v)) &&
          new Date(v).toISOString().slice(0, 10) === v &&
          v <= new Date().toISOString().slice(0, 10),
        "Invalid or future date",
      ),
    downloads: count,
    redownloads: count,
    impressions: count,
    store_views: count,
    active_users: count,
    signups: count,
    sessions: count,
    actions: count,
    subscribers: count,
    trials: count,
    new_subscribers: count,
    cancellations: count,
    renewals: count,
    refunds: count,
    mrr_gbp: z.number().nonnegative().max(1e10).nullable().optional(),
    retention_d1: rate,
    retention_d7: rate,
    retention_d30: rate,
    proceeds: z
      .record(z.string().regex(/^[A-Z]{3}$/), z.number().finite())
      .optional(),
  })
  .strict();
export type HqDay = z.infer<typeof daySchema>;
export const importSchema = z
  .object({
    app: appSlugSchema,
    source: z.enum(["app_store_export", "product_export", "billing_export"]),
    description: z.string().min(5).max(240),
    days: z.array(daySchema).min(1).max(90),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (new Set(v.days.map((d) => d.date)).size !== v.days.length)
      ctx.addIssue({ code: "custom", message: "Duplicate dates" });
    const allowed: Record<string, string[]> = {
      app_store_export: [
        "downloads",
        "redownloads",
        "impressions",
        "store_views",
        "proceeds",
        "refunds",
      ],
      product_export: [
        "active_users",
        "signups",
        "sessions",
        "actions",
        "retention_d1",
        "retention_d7",
        "retention_d30",
      ],
      billing_export: [
        "subscribers",
        "trials",
        "new_subscribers",
        "cancellations",
        "renewals",
        "refunds",
        "mrr_gbp",
      ],
    };
    for (const d of v.days)
      for (const key of Object.keys(d))
        if (key !== "date" && !allowed[v.source]!.includes(key))
          ctx.addIssue({
            code: "custom",
            message: `${key} does not belong to ${v.source}`,
          });
  });
export const appleSettingsSchema = z
  .object({
    apple_app_id: z.string().regex(/^\d{5,20}$/),
    vendor_number: z.string().regex(/^\d{5,20}$/),
    sku: z.string().min(1).max(150),
  })
  .strict();
export type AppleSettings = z.infer<typeof appleSettingsSchema>;
export interface StoredDay {
  source: string;
  description: string;
  captured_at: string;
  data: HqDay;
}
/** A missing day remains null; a partial total is never displayed as a complete period. */
export function periodTotal(
  days: HqDay[],
  key: keyof HqDay,
  expected: number,
): number | null {
  if (days.length !== expected || days.some((d) => typeof d[key] !== "number"))
    return null;
  return days.reduce((n, d) => n + (d[key] as number), 0);
}
export function parseSalesReport(
  tsv: string,
  settings: AppleSettings,
  date: string,
): HqDay {
  const lines = tsv
    .replace(/^\uFEFF/, "")
    .trim()
    .split(/\r?\n/);
  const headers = lines.shift()!.split("\t");
  const required = [
    "Apple Identifier",
    "SKU",
    "Parent Identifier",
    "Product Type Identifier",
    "Units",
    "Developer Proceeds",
    "Currency of Proceeds",
  ];
  if (required.some((h) => !headers.includes(h)))
    throw new Error("Apple report columns are not supported");
  const result: HqDay = {
    date,
    downloads: 0,
    redownloads: 0,
    refunds: 0,
    proceeds: {},
  };
  for (const line of lines) {
    const values = line.split("\t");
    const row = Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ""]));
    if (
      row["Apple Identifier"] !== settings.apple_app_id &&
      row["Parent Identifier"] !== settings.sku
    )
      continue;
    if (
      row["Apple Identifier"] === settings.apple_app_id &&
      row.SKU !== settings.sku
    )
      throw new Error("Apple report app ID and SKU do not match");
    for (const field of ["Begin Date", "End Date"]) {
      if (!headers.includes(field)) continue;
      const m = row[field]?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      const reportedDate = m ? `${m[3]}-${m[1]}-${m[2]}` : row[field];
      if (reportedDate !== date)
        throw new Error("Apple report date does not match requested day");
    }
    const units = Number(row.Units),
      proceeds = Number(row["Developer Proceeds"]);
    if (!row.Units || !Number.isFinite(units) || !Number.isFinite(proceeds))
      throw new Error("Invalid Apple report amount");
    const type = row["Product Type Identifier"]!;
    if (row["Apple Identifier"] === settings.apple_app_id && units > 0) {
      if (["1", "1F", "1T"].includes(type)) result.downloads! += units;
      if (["3", "3F"].includes(type)) result.redownloads! += units;
    }
    if (units < 0 && row.CMB !== "CMB-C") result.refunds! += Math.abs(units);
    const currency = row["Currency of Proceeds"]!;
    if (/^[A-Z]{3}$/.test(currency))
      result.proceeds![currency] =
        (result.proceeds![currency] ?? 0) + units * proceeds;
    else if (proceeds !== 0) throw new Error("Missing proceeds currency");
  }
  for (const c of Object.keys(result.proceeds!))
    result.proceeds![c] = Math.round(result.proceeds![c]! * 100) / 100;
  return daySchema.parse(result);
}

export { reportedTotal } from "./hq-report-summary";

/** Only Apple's explicit no-sales response confirms zero; generic 404s do not. */
export function appleConfirmsNoSales(status: number, body: unknown): boolean {
  if (status !== 404 || !body || typeof body !== "object") return false;
  const errors = (body as { errors?: unknown }).errors;
  return (
    Array.isArray(errors) &&
    errors.length === 1 &&
    errors[0]?.code === "NOT_FOUND" &&
    errors[0]?.detail === "There were no sales for the date specified."
  );
}
