import { ownerFromRequest } from '../lib/auth';
import { Db } from '../lib/db';
import { baselineSchema } from '../lib/deadset-baseline';
import type { Env } from '../types';
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
export async function handleDeadset(req: Request, env: Env): Promise<Response> {
  try {
    if (!await ownerFromRequest(req, env)) return reply({ error: 'unauthorized' }, 401);
    const db = new Db(env);
    if (req.method === 'GET') {
      const rows = await db.select<{ payload: unknown }>('deadset_baselines', 'select=payload&order=captured_at.desc&limit=2');
      return reply({ current: rows[0] ? baselineSchema.parse(rows[0].payload) : null, previous: rows[1] ? baselineSchema.parse(rows[1].payload) : null });
    }
    if (req.method !== 'POST') return reply({ error: 'method not allowed' }, 405);
    // Enforce a streamed byte cap, including clients without Content-Length.
    const reader = req.body?.getReader();
    if (!reader) return reply({ error: 'missing baseline' }, 400);
    let size = 0;
    const decoder = new TextDecoder();
    let text = '';
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 64000) { await reader.cancel(); return reply({ error: 'baseline too large' }, 413); }
        text += decoder.decode(value, { stream: true });
      }
      text += decoder.decode();
    } finally { reader.releaseLock(); }
    let raw: unknown;
    try { raw = JSON.parse(text); } catch { return reply({ error: 'invalid JSON' }, 400); }
    const parsed = baselineSchema.safeParse(raw);
    if (!parsed.success) return reply({ error: 'invalid baseline', issues: parsed.error.issues.map(i => i.message) }, 400);
    if (Date.parse(parsed.data.captured_at) > Date.now() + 60000) return reply({ error: 'baseline is in the future' }, 400);
    const existing = await db.selectOne<{ payload: unknown }>('deadset_baselines', `captured_at=eq.${encodeURIComponent(parsed.data.captured_at)}&select=payload`);
    if (existing) return reply({ error: 'A baseline already exists for this capture time' }, 409);
    await db.insert('deadset_baselines', { captured_at: parsed.data.captured_at, payload: parsed.data });
    return reply({ saved: true }, 201);
  } catch {
    // Do not expose database URLs, SQL, stored payloads or provider messages.
    return reply({ error: 'Baseline storage unavailable. Check migration and service health.' }, 503);
  }
}
