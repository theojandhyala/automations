import { baselineSchema } from './lib/deadset-baseline';
import { collectDeadsetSource } from './lib/deadset-source';

const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
export async function refreshBaseline(env: HqEnv) {
  const current = await collectDeadsetSource(env.DEADSET_SOURCE_URL, env.DEADSET_SOURCE_KEY);
  const previous = await env.BASELINE.get('current');
  if (previous) await env.BASELINE.put('previous', previous);
  await env.BASELINE.put('current', JSON.stringify(current));
  return current;
}
export default {
  async fetch(req: Request, env: HqEnv): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/api/')) {
      // Existing owner authentication remains authoritative. No shared admin token.
      let auth: Response;
      try { auth = await env.AUTOMATIONS.fetch(new Request('https://automations.internal/api/me', { headers: { Authorization: req.headers.get('Authorization') ?? '' } })); }
      catch { return reply({ error: 'Owner authentication temporarily unavailable' }, 503); }
      if (auth.status >= 500) { await auth.body?.cancel(); return reply({ error: 'Owner authentication temporarily unavailable' }, 503); }
      if (!auth.ok) { await auth.body?.cancel(); return reply({ error: 'Owner sign-in required' }, 401); }
      await auth.body?.cancel();
      if (url.pathname === '/api/deadset/baselines' && req.method === 'GET') {
        const [current, previous] = await Promise.all([env.BASELINE.get('current', 'json'), env.BASELINE.get('previous', 'json')]);
        return reply({ current: current ? baselineSchema.parse(current) : null, previous: previous ? baselineSchema.parse(previous) : null });
      }
      if (url.pathname === '/api/deadset/refresh' && req.method === 'POST') {
        const cached = await env.BASELINE.get<{ captured_at: string }>('current', 'json');
        if (cached && Date.now() - Date.parse(cached.captured_at) < 5 * 60000) return reply({ current: cached, cached: true });
        try { return reply({ current: await refreshBaseline(env) }); }
        catch { return reply({ error: 'Source refresh failed. The previous baseline is preserved.' }, 503); }
      }
      // Delegate operational actions to the established approval and audit paths.
      return env.AUTOMATIONS.fetch(new Request(new URL(url.pathname + url.search, 'https://automations.theojandhyala.workers.dev'), req));
    }
    const response = await env.ASSETS.fetch(req);
    const headers = new Headers(response.headers);
    headers.set('X-Robots-Tag', 'noindex, nofollow');
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    headers.set('X-Frame-Options', 'DENY');
    headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' https: data: blob:; media-src 'self' https: blob:; connect-src 'self' https://ewmgvujlqvdctzryfbid.supabase.co wss://ewmgvujlqvdctzryfbid.supabase.co; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    return new Response(response.body, { status: response.status, headers });
  },
  async scheduled(_event: ScheduledController, env: HqEnv, ctx: ExecutionContext) {
    ctx.waitUntil(refreshBaseline(env).catch(() => { console.error('DEADSET baseline refresh failed; previous snapshot preserved'); }));
  },
} satisfies ExportedHandler<HqEnv>;
