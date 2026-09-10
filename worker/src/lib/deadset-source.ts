import { calculateBaseline } from './deadset-baseline';

/** Bounded, read-only collection. Source identities never leave the aggregate boundary. */
export async function collectDeadsetSource(origin: string, key: string) {
  const url = new URL(origin);
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.supabase.co')) throw new Error('Invalid source origin');
  let bytes = 0;
  async function all<T>(table: string, select: string, order: string): Promise<T[]> {
    const rows: T[] = [];
    let total: number | undefined;
    while (true) {
      const query = new URLSearchParams({ select, order, offset: String(rows.length), limit: '100' });
      const res = await fetch(`${url.origin}/rest/v1/${table}?${query}`, { headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: 'count=exact' }, signal: AbortSignal.timeout(20000), redirect: 'error' });
      if (!res.ok) { await res.body?.cancel(); throw new Error(`Source ${table} unavailable (${res.status})`); }
      const range = res.headers.get('content-range')?.split('/')[1];
      const currentTotal = range && /^\d+$/.test(range) ? Number(range) : NaN;
      if (!Number.isSafeInteger(currentTotal) || currentTotal > 100000 || (total !== undefined && currentTotal !== total)) { await res.body?.cancel(); throw new Error('Source coverage changed or exceeded collection limit'); }
      total = currentTotal;
      const reader = res.body?.getReader();
      if (!reader) throw new Error('Empty source response');
      const decoder = new TextDecoder();
      let text = '', pageBytes = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength; pageBytes += value.byteLength;
          if (bytes > 24_000_000 || pageBytes > 8_000_000) { await reader.cancel(); throw new Error('Source exceeds safe collection size'); }
          text += decoder.decode(value, { stream: true });
        }
        text += decoder.decode();
      } finally { reader.releaseLock(); }
      const page: T[] = JSON.parse(text);
      if (!Array.isArray(page)) throw new Error('Invalid source response');
      rows.push(...page);
      if (rows.length === total) return rows;
      if (!page.length || rows.length > total) throw new Error('Incomplete source coverage');
    }
  }
  type Inputs = Parameters<typeof calculateBaseline>;
  const [profiles, states, subscriptions] = await Promise.all([
    all<Inputs[0][number]>('profiles', 'id,created_at', 'id.asc'),
    all<Inputs[1][number]>('user_state', 'user_id,sessions:data->sessions,attribution:data->signupSource', 'user_id.asc'),
    all<Inputs[2][number]>('subscriptions', 'user_id,status,environment,current_period_end,cancel_at_period_end', 'id.asc'),
  ]);
  return calculateBaseline(profiles, states, subscriptions, new Date());
}
