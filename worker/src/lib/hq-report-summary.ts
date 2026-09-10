import type { HqDay } from "./hq-metrics";
/** A received-report subtotal; never present missing reports as observed zero. */
export function reportedTotal(days: HqDay[], key: keyof HqDay) {
  const observed = days.filter((d) => typeof d[key] === "number");
  return {
    value: observed.length
      ? observed.reduce((sum, d) => sum + (d[key] as number), 0)
      : null,
    received: observed.length,
    expected: days.length,
    complete: days.length > 0 && observed.length === days.length,
  };
}
