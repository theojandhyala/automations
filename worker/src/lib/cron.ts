/**
 * Minimal 5-field cron (minute hour day-of-month month day-of-week), UTC.
 * Supports *, lists, ranges and steps -- enough for scheduling automations,
 * without pulling a dependency into the Worker bundle.
 */

const FIELD_RANGES: Array<[number, number]> = [
  [0, 59], // minute
  [0, 23], // hour
  [1, 31], // day of month
  [1, 12], // month
  [0, 6],  // day of week (0 = Sunday)
];

function parseField(field: string, min: number, max: number): Set<number> {
  const values = new Set<number>();
  for (const part of field.split(',')) {
    const [rangePart, stepPart] = part.split('/');
    const step = stepPart ? Number(stepPart) : 1;
    if (!Number.isInteger(step) || step < 1) throw new Error(`bad cron step: ${part}`);

    let lo: number;
    let hi: number;
    if (rangePart === '*' || rangePart === undefined) {
      lo = min;
      hi = max;
    } else if (rangePart.includes('-')) {
      const [a, b] = rangePart.split('-');
      lo = Number(a);
      hi = Number(b);
    } else {
      lo = Number(rangePart);
      hi = stepPart ? max : lo;
    }
    if (!Number.isInteger(lo) || !Number.isInteger(hi) || lo < min || hi > max || lo > hi) {
      throw new Error(`bad cron field: ${part}`);
    }
    for (let v = lo; v <= hi; v += step) values.add(v);
  }
  return values;
}

export function parseCron(expr: string): Set<number>[] {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) throw new Error(`cron must have 5 fields, got ${fields.length}`);
  return fields.map((f, i) => {
    const range = FIELD_RANGES[i]!;
    return parseField(f, range[0], range[1]);
  });
}

/** True if `expr` is a valid 5-field cron expression. */
export function isValidCron(expr: string): boolean {
  try {
    parseCron(expr);
    return true;
  } catch {
    return false;
  }
}

/**
 * Next UTC minute strictly after `from` that matches `expr`. Returns null if
 * nothing matches within a year (e.g. Feb 30), rather than looping forever.
 */
export function nextRun(expr: string, from: Date = new Date()): Date | null {
  const [minutes, hours, doms, months, dows] = parseCron(expr) as [
    Set<number>, Set<number>, Set<number>, Set<number>, Set<number>,
  ];

  const t = new Date(from);
  t.setUTCSeconds(0, 0);
  t.setUTCMinutes(t.getUTCMinutes() + 1);

  const limit = 366 * 24 * 60;
  for (let i = 0; i < limit; i++) {
    const domRestricted = doms.size !== 31;
    const dowRestricted = dows.size !== 7;
    // cron's quirk: when both day fields are restricted they OR, not AND.
    const dayMatches =
      domRestricted && dowRestricted
        ? doms.has(t.getUTCDate()) || dows.has(t.getUTCDay())
        : doms.has(t.getUTCDate()) && dows.has(t.getUTCDay());

    if (
      minutes.has(t.getUTCMinutes()) &&
      hours.has(t.getUTCHours()) &&
      months.has(t.getUTCMonth() + 1) &&
      dayMatches
    ) {
      return t;
    }
    t.setUTCMinutes(t.getUTCMinutes() + 1);
  }
  return null;
}
