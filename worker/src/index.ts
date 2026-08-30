import { handleApi } from './api/router';
import { backfillSchedules, dispatchDue } from './lib/runner';
import type { Env } from './types';

/**
 * One Worker serves both halves of the control plane: the dashboard SPA and
 * its API on /api/*, plus the scheduled dispatcher that actually runs the
 * automations.
 */
export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname.startsWith('/api/')) {
      try {
        return await handleApi(req, env, ctx);
      } catch (err) {
        console.error('api error', err);
        return new Response(
          JSON.stringify({ error: err instanceof Error ? err.message : 'internal error' }),
          { status: 500, headers: { 'Content-Type': 'application/json' } },
        );
      }
    }

    return env.ASSETS.fetch(req);
  },

  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      (async () => {
        await backfillSchedules(env);
        const { started } = await dispatchDue(env);
        if (started > 0) console.log(`dispatched ${started} automation(s)`);
      })().catch((err) => console.error('scheduled pass failed', err)),
    );
  },
};
