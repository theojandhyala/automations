const COUNTERS = ['drafted', 'produced', 'auto_approved', 'blocked', 'published', 'submitted', 'skipped', 'failed', 'outside_window'] as const;

/** Safe operational counts only: never log arbitrary result payloads or media/copy. */
export function runOutcomeCounts(result: unknown): Record<string, number> {
  if (!result || typeof result !== 'object') return {};
  const values = result as Record<string, unknown>;
  return Object.fromEntries(COUNTERS.flatMap(key => {
    const value = values[key];
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? [[key, value]] : [];
  }));
}
