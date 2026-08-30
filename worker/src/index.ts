import { handleApiSafe } from './api/router';
import { backfillSchedules, dispatchDue } from './lib/runner';
import { log, errorFields } from './lib/log';
import type { Env } from './types';
import { streamMedia } from './lib/storage';

/**
 * One Worker serves both halves of the control plane: the dashboard SPA and
 * its API on /api/*, plus the scheduled dispatcher that actually runs the
 * automations.
 */
export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname.startsWith('/api/')) {
      return handleApiSafe(req, env, ctx);
    }

    if (url.pathname.startsWith('/media/') && (req.method === 'GET' || req.method === 'HEAD')) {
      return streamMedia(env, url.pathname.slice('/media/'.length), req);
    }

    return env.ASSETS.fetch(req);
  },

  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      (async () => {
        await backfillSchedules(env);
        const { started } = await dispatchDue(env);
        if (started > 0) log.info('dispatch pass', { started });
      })().catch((err) => log.error('scheduled pass failed', errorFields(err))),
    );
  },
};
