import type { HqDay } from "./hq-metrics";
/** A received-report subtotal; never present missing reports as observed zero. */
export function reportedTotal(days: HqDay[], key: keyof HqDay) {
  const observed = days.filter((d) => typeof d[key] === "number");
  const complete = days.length > 0 && observed.length === days.length;
  const subtotal = observed.reduce((sum, d) => sum + (d[key] as number), 0);
  return {
    value: observed.length && (complete || subtotal !== 0) ? subtotal : null,
    subtotal: observed.length ? subtotal : null,
    received: observed.length,
    expected: days.length,
    complete,
  };
}

/** Count first downloads and re-downloads once; updates never enter this total. */
export function downloadSummary(days: HqDay[]) {
  return reportedTotal(days.map(d => ({ date: d.date,
    downloads: typeof d.downloads === 'number' && typeof d.redownloads === 'number'
      ? d.downloads + d.redownloads : null,
  })), 'downloads');
}
