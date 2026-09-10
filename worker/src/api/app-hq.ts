import type { HqPayload } from "../lib/hq-contract";
import { ownerFromRequest } from "../lib/auth";
import { Db } from "../lib/db";
import { baselineSchema, type DeadsetBaseline } from "../lib/deadset-baseline";
import {
  appSlugSchema,
  appleSettingsSchema,
  importSchema,
  type HqApp,
  type HqDay,
  type StoredDay,
  type AppleSettings,
} from "../lib/hq-metrics";
import { appleCredentials, boundedText, syncApple } from "../lib/hq-apple";
import { appStoreRequest } from "../lib/app-store";
import type { Env, Automation } from "../types";
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
async function readJson(req: Request) {
  return JSON.parse(await boundedText(req.body, 100_000)) as unknown;
}
async function readPrefix<T>(env: Env, prefix: string): Promise<T[]> {
  const list = await env.HQ_DATA.list({ prefix, limit: 1000 });
  if (!list.list_complete) throw new Error("History exceeds supported window");
  const result: T[] = [];
  for (let i = 0; i < list.keys.length; i += 20) {
    const rows = await Promise.all(
      list.keys.slice(i, i + 20).map((k) => env.HQ_DATA.get<T>(k.name, "json")),
    );
    for (const r of rows) if (r) result.push(r);
  }
  return result;
}
export async function captureHqBaseline(env: Env) {
  const raw = await env.DEADSET_BASELINE.get("current", "json");
  if (!raw) return null;
  const baseline = baselineSchema.parse(raw);
  const day = baseline.captured_at.slice(0, 10);
  const key = `deadset/baseline/${day}`;
  const existing = await env.HQ_DATA.get<DeadsetBaseline>(key, "json");
  if (!existing || existing.captured_at < baseline.captured_at)
    await env.HQ_DATA.put(key, JSON.stringify(baseline), {
      expirationTtl: 370 * 86400,
    });
  return baseline;
}
export async function loadHq(
  env: Env,
  app: HqApp,
  days: number,
): Promise<HqPayload> {
  const db = new Db(env);
  const row = await db.selectOne<{ id: string }>(
    "apps",
    `slug=eq.${app}&select=id`,
  );
  if (!row) throw new Error("App is unavailable");
  const id = row.id,
    errors: string[] = [];
  const start = new Date(Date.now() - days * 86400000)
    .toISOString()
    .slice(0, 10);
  async function safe<T>(
    name: string,
    task: Promise<T>,
    fallback: T,
  ): Promise<T> {
    try {
      return await task;
    } catch {
      errors.push(`${name} could not refresh. Retry or check the connection.`);
      return fallback;
    }
  }
  const [
    baseline,
    history,
    records,
    settings,
    sync,
    secret,
    channels,
    snapshots,
    posts,
    automations,
  ] = await Promise.all([
    app === "deadset"
      ? safe("Product snapshot", captureHqBaseline(env), null)
      : Promise.resolve(null),
    app === "deadset"
      ? safe(
          "Product history",
          readPrefix<DeadsetBaseline>(env, "deadset/baseline/"),
          [],
        )
      : Promise.resolve([]),
    safe("Report history", readPrefix<StoredDay>(env, `${app}/day/`), []),
    env.HQ_DATA.get<AppleSettings>(`${app}/apple-settings`, "json"),
    env.HQ_DATA.get<HqPayload["apple_sync"]>(`${app}/apple-sync`, "json"),
    safe(
      "Apple connection",
      db.selectOne<{ provider: string }>(
        "integration_secrets",
        "provider=eq.app_store_connect&select=provider",
      ),
      null,
    ),
    safe(
      "TikTok channels",
      db.select<HqPayload["channels"][number]>(
        "tiktok_accounts_public",
        `app_id=eq.${id}&select=id,handle,status`,
      ),
      [],
    ),
    safe(
      "Follower history",
      db.select<HqPayload["snapshots"][number]>(
        "analytics_snapshots",
        `app_id=eq.${id}&captured_at=gte.${start}&select=account_id,captured_at,followers,quality&order=captured_at.desc&limit=1000`,
      ),
      [],
    ),
    safe(
      "Content",
      db.select<HqPayload["posts"][number]>(
        "artifacts",
        `app_id=eq.${id}&select=id,hook,status,published_at,created_at,tiktok_post_id&order=created_at.desc&limit=1000`,
      ),
      [],
    ),
    safe(
      "Automation controls",
      db.select<Automation>(
        "automations",
        `app_id=eq.${id}&select=*&order=name`,
      ),
      [],
    ),
  ]);
  const postMetrics = channels.length
    ? await safe(
        "Post performance",
        db.select<HqPayload["post_metrics"][number]>(
          "post_metrics",
          `account_id=in.(${channels.map((c) => c.id).join(",")})&select=account_id,tiktok_post_id,artifact_id,captured_at,views,likes,comments,shares&order=captured_at.desc&limit=1000`,
        ),
        [],
      )
    : [];
  if (
    posts.length === 1000 ||
    snapshots.length === 1000 ||
    postMetrics.length === 1000
  )
    errors.push(
      "Content charts show a bounded sample of the latest 1,000 records.",
    );
  // Manual reports are explicit sources; API reports take priority for the same Apple date.
  const recent = records
    .filter((r) => r.data.date >= start)
    .sort(
      (a, b) =>
        (a.source === "app_store_connect" ? 1 : 0) -
          (b.source === "app_store_connect" ? 1 : 0) ||
        a.captured_at.localeCompare(b.captured_at),
    );
  const daily = new Map<string, HqDay>();
  for (const r of recent)
    daily.set(r.data.date, { ...daily.get(r.data.date), ...r.data });
  if (baseline && !history.some((b) => b.captured_at === baseline.captured_at))
    history.push(baseline);
  return {
    app,
    refreshed_at: new Date().toISOString(),
    days: [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)),
    records: recent,
    baseline,
    baseline_history: history
      .filter((b) => b.captured_at.slice(0, 10) >= start)
      .sort((a, b) => a.captured_at.localeCompare(b.captured_at)),
    apple_configured: !!secret,
    apple_settings: settings,
    apple_sync: sync,
    channels,
    snapshots,
    posts,
    post_metrics: postMetrics,
    automations,
    errors,
  };
}
export async function handleAppHq(req: Request, env: Env): Promise<Response> {
  try {
    if (!(await ownerFromRequest(req, env)))
      return reply({ error: "Owner sign-in required" }, 401);
    const url = new URL(req.url),
      match = url.pathname.match(
        /^\/api\/hq\/([^/]+)(?:\/(settings|sync|import|catalog))?$/,
      );
    const slug = appSlugSchema.safeParse(match?.[1]);
    if (!slug.success) return reply({ error: "Unknown app workspace" }, 404);
    const app = slug.data,
      action = match?.[2];
    if (!action && req.method === "GET")
      return reply(
        await loadHq(
          env,
          app,
          [7, 30, 90].includes(Number(url.searchParams.get("days")))
            ? Number(url.searchParams.get("days"))
            : 30,
        ),
      );
    if (action === "settings" && req.method === "PUT") {
      const parsed = appleSettingsSchema.safeParse(await readJson(req));
      if (!parsed.success)
        return reply(
          {
            error: "A valid Apple app ID, vendor number and SKU are required.",
          },
          400,
        );
      const creds = await appleCredentials(env);
      if (!creds)
        return reply({ error: "Connect Apple credentials first." }, 409);
      const response = await appStoreRequest<{ sku: string; name: string }>(
        creds,
        `/v1/apps/${parsed.data.apple_app_id}?fields[apps]=sku,name`,
      );
      const data = Array.isArray(response.data)
        ? response.data[0]
        : response.data;
      if (data?.attributes?.sku !== parsed.data.sku)
        return reply(
          { error: "The selected app SKU does not match Apple." },
          400,
        );
      await env.HQ_DATA.put(
        `${app}/apple-settings`,
        JSON.stringify(parsed.data),
      );
      return reply({ saved: true });
    }
    if (action === "catalog" && req.method === "GET") {
      const creds = await appleCredentials(env);
      if (!creds) return reply({ apps: [] });
      const response = await appStoreRequest<{
        sku: string;
        name: string;
        bundleId: string;
      }>(creds, "/v1/apps?fields[apps]=name,sku,bundleId&limit=200");
      return reply({
        apps: (Array.isArray(response.data) ? response.data : []).map((a) => ({
          id: a.id,
          ...a.attributes,
        })),
      });
    }
    if (action === "sync" && req.method === "POST") {
      const last = await env.HQ_DATA.get<{ at: string }>(
        `${app}/apple-sync`,
        "json",
      );
      if (last && Date.now() - Date.parse(last.at) < 300000)
        return reply(
          { error: "Reports were checked recently. Retry in five minutes." },
          429,
        );
      try {
        return reply(await syncApple(env, app));
      } catch (e) {
        const message =
          e instanceof Error ? e.message : "Apple report sync failed";
        await env.HQ_DATA.put(
          `${app}/apple-sync`,
          JSON.stringify({
            saved: 0,
            errors: [message],
            at: new Date().toISOString(),
          }),
        );
        return reply({ error: message }, 502);
      }
    }
    if (action === "import" && req.method === "POST") {
      const parsed = importSchema.safeParse(await readJson(req));
      if (!parsed.success)
        return reply(
          {
            error:
              "Invalid report: " +
              parsed.error.issues
                .map((i) => i.message)
                .slice(0, 3)
                .join("; "),
          },
          400,
        );
      if (parsed.data.app !== app)
        return reply({ error: "The report belongs to a different app." }, 400);
      const captured_at = new Date().toISOString();
      for (const data of parsed.data.days) {
        const r: StoredDay = {
          data,
          source: parsed.data.source,
          description: parsed.data.description,
          captured_at,
        };
        await env.HQ_DATA.put(
          `${app}/day/${r.source}/${data.date}`,
          JSON.stringify(r),
          { expirationTtl: 370 * 86400 },
        );
      }
      return reply({ saved: parsed.data.days.length });
    }
    return reply({ error: "Method not allowed" }, 405);
  } catch {
    return reply(
      {
        error:
          "HQ could not complete this request. Check the connection and retry.",
      },
      503,
    );
  }
}
