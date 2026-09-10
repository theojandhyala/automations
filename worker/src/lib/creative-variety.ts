/** Exact and near-identical hooks remain blocked even when the model ignores its brief. */
export function isRepeatedHook(hook: string, previous: string[]): boolean {
  const tokens = (text: string) => new Set(text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);
  const current = tokens(hook);
  if (!current.size) return true;
  return previous.some(value => {
    const other = tokens(value);
    const intersection = [...current].filter(word => other.has(word)).length;
    return intersection / new Set([...current, ...other]).size >= 0.8;
  });
}
