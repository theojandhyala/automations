import { refreshBilling } from "./lib/hq-billing";
import { refreshProduct } from "./lib/hq-product";
import { handleAppHq, captureHqBaseline } from "./api/app-hq";
import { syncApple } from "./lib/hq-apple";
import { handleDeadset } from "./api/deadset";
import { handleApiSafe } from "./api/router";
import { backfillSchedules, dispatchDue } from "./lib/runner";
import { log, errorFields } from "./lib/log";
import type { Env } from "./types";
import { streamMedia } from "./lib/storage";

/**
 * One Worker serves both halves of the control plane: the dashboard SPA and
 * its API on /api/*, plus the scheduled dispatcher that actually runs the
 * automations.
 */
export default {
  async fetch(
    req: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname.startsWith("/api/hq/")) return handleAppHq(req, env, ctx);

    if (url.pathname === "/api/deadset/baselines")
      return handleDeadset(req, env);

    if (url.pathname.startsWith("/api/")) {
      return handleApiSafe(req, env, ctx);
    }

    if (
      url.pathname.startsWith("/media/") &&
      (req.method === "GET" || req.method === "HEAD")
    ) {
      return streamMedia(env, url.pathname.slice("/media/".length), req);
    }

    return env.ASSETS.fetch(req);
  },

  async scheduled(
    _event: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    const now = new Date();
    if (now.getUTCMinutes() % 5 === 0)
      ctx.waitUntil(
        Promise.all(
          (["deadset", "cast"] as const).flatMap((app) => [
            refreshProduct(env, app, true),
            refreshBilling(env, app, true),
          ]),
        ).catch(() => log.warn("HQ product sync failed")),
      );
    if (now.getUTCMinutes() === 25)
      ctx.waitUntil(
        captureHqBaseline(env).catch(() =>
          log.warn("HQ product snapshot unavailable"),
        ),
      );
    if (now.getUTCMinutes() === 30)
      ctx.waitUntil(
        (async () => {
          for (const app of ["deadset", "cast"] as const) {
            if (await env.HQ_DATA.get(`${app}/apple-settings`)) {
              try {
                await syncApple(env, app);
              } catch {
                await env.HQ_DATA.put(
                  `${app}/apple-sync`,
                  JSON.stringify({
                    saved: 0,
                    errors: [
                      "Scheduled Apple report sync failed. Retry from App Store or check reporting access.",
                    ],
                    at: new Date().toISOString(),
                  }),
                );
              }
            }
          }
        })().catch(() => log.warn("HQ reporting schedule failed")),
      );
    ctx.waitUntil(
      (async () => {
        await backfillSchedules(env);
        const { started } = await dispatchDue(env);
        if (started > 0) log.info("dispatch pass", { started });
      })().catch((err) => log.error("scheduled pass failed", errorFields(err))),
    );
  },
};
