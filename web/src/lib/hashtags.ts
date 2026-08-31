const HASHTAG_TOKEN = /[\p{L}\p{N}_]+/gu;

/** Keep browser editing/copying identical to the Worker publishing path. */
export function normalizeHashtags(values: string[], limit = 5): string[] {
  const tags: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const chunks = value
      .replace(/#/g, ' #')
      .split(/[\s,;]+/)
      .map((chunk) => chunk.replace(/^#+/, '').match(HASHTAG_TOKEN)?.[0]?.toLowerCase() ?? '')
      .filter(Boolean);

    for (const tag of chunks) {
      if (seen.has(tag)) continue;
      seen.add(tag);
      tags.push(tag);
      if (tags.length >= limit) return tags;
    }
  }

  return tags;
}

export function formatHashtags(values: string[], limit = 5): string {
  return normalizeHashtags(values, limit).map((tag) => `#${tag}`).join(' ');
}
