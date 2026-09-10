import type { ProductSnapshot } from "./hq-contract";
import { z } from "zod";
import { encrypt, decrypt } from "./crypto";
import { boundedText } from "./hq-apple";
import { calculateBaseline, type DeadsetBaseline } from "./deadset-baseline";
import type { Env } from "../types";
import type { HqApp, HqDay } from "./hq-metrics";
export const PRODUCT_ORIGINS = {
  deadset: "https://fqfdygbveeztgxwkbmfi.supabase.co",
  cast: "https://uybimnurdkegyxfngvhc.supabase.co",
} as const;
export const productKeySchema = z
  .object({ key: z.string().min(30).max(5000) })
  .strict();
export type Profile = { id: string; created_at: string };
export type Activity = {
  id: string;
  user_id: string;
  at: string;
  kind: "action" | "session";
};
const DAY = 86400000;
/** Source activity, not app opens. Profile-date cohorts only; immature cohorts remain null. */
export function productMetrics(
  app: HqApp,
  profiles: Profile[],
  events: Activity[],
  now = new Date(),
): ProductSnapshot {
  const end = now.getTime(),
    today = Date.parse(now.toISOString().slice(0, 10));
  const known = new Set(profiles.map((p) => p.id));
  if (known.size !== profiles.length)
    throw new Error("Duplicate source profiles");
  const seen = new Set<string>(),
    valid: Activity[] = [];
  let excluded = 0;
  for (const e of events) {
    const key = `${e.kind}/${e.id}`,
      at = Date.parse(e.at);
    if (
      !known.has(e.user_id) ||
      !Number.isFinite(at) ||
      at > end ||
      seen.has(key)
    ) {
      excluded++;
      continue;
    }
    seen.add(key);
    valid.push({ ...e, at: new Date(at).toISOString() });
  }
  const userDates = new Map<string, Set<string>>(),
    actions = new Map<string, number>();
  for (const e of valid) {
    const dates = userDates.get(e.user_id) ?? new Set<string>();
    dates.add(e.at.slice(0, 10));
    userDates.set(e.user_id, dates);
    if (e.kind === "action")
      actions.set(e.user_id, (actions.get(e.user_id) ?? 0) + 1);
  }
  const days: HqDay[] = [];
  for (let i = 90; i >= 0; i--) {
    const start = today - i * DAY,
      date = new Date(start).toISOString().slice(0, 10),
      cohort = profiles.filter((p) => p.created_at.slice(0, 10) === date),
      daily = valid.filter((e) => e.at.slice(0, 10) === date);
    function retention(n: number) {
      if (!cohort.length || start + (n + 1) * DAY > today) return null;
      const target = new Date(start + n * DAY).toISOString().slice(0, 10);
      return (
        Math.round(
          (cohort.filter((p) => userDates.get(p.id)?.has(target)).length /
            cohort.length) *
            10000,
        ) / 100
      );
    }
    days.push({
      date,
      signups: cohort.length,
      actions: daily.filter((e) => e.kind === "action").length,
      sessions: daily.filter((e) => e.kind === "session").length,
      active_users: new Set(daily.map((e) => e.user_id)).size,
      retention_d1: retention(1),
      retention_d7: retention(7),
      retention_d30: retention(30),
    });
  }
  const active = (window: number) =>
    new Set(
      valid
        .filter((e) => Date.parse(e.at) >= end - window)
        .map((e) => e.user_id),
    ).size;
  return {
    app,
    captured_at: now.toISOString(),
    registered_users: profiles.length,
    actions_total: valid.filter((e) => e.kind === "action").length,
    sessions_total: valid.filter((e) => e.kind === "session").length,
    first_action_users: [...actions.values()].filter((n) => n > 0).length,
    second_action_users: [...actions.values()].filter((n) => n > 1).length,
    activity_users_24h: active(DAY),
    activity_users_7d: active(7 * DAY),
    days,
    excluded_records: excluded,
    definition:
      app === "cast"
        ? "Recorded catches and started fishing sessions. Retention is recorded-activity retention by signup UTC day, not app-open retention."
        : "Completed synced workouts and started saved sessions. Retention is recorded-activity retention by signup UTC day, not app-open retention.",
  };
}
async function sourceReader(app: HqApp, key: string) {
  // The elevated key must bypass RLS. A publishable/anon key can return a misleading empty result.
  if (!key.startsWith("sb_secret_")) {
    try {
      if (JSON.parse(atob(key.split(".")[1] ?? "")).role !== "service_role")
        throw new Error();
    } catch {
      throw new Error(
        "Use a server-side secret or service_role key, not a publishable key.",
      );
    }
  }
  let bytes = 0;
  return async function all<T>(
    table: string,
    select: string,
    order = "id.asc",
  ): Promise<T[]> {
    const rows: T[] = [];
    let total: number | undefined;
    while (true) {
      const query = new URLSearchParams({
        select,
        order,
        offset: String(rows.length),
        limit: "500",
      });
      const res = await fetch(
        `${PRODUCT_ORIGINS[app]}/rest/v1/${table}?${query}`,
        {
          headers: {
            apikey: key,
            ...(key.startsWith("sb_secret_")
              ? {}
              : { Authorization: `Bearer ${key}` }),
            Prefer: "count=exact",
          },
          signal: AbortSignal.timeout(20000),
          redirect: "manual",
        },
      );
      if (!res.ok) {
        await res.body?.cancel();
        throw new Error(
          `Product ${table} could not be read (${res.status}). Check the source key and schema.`,
        );
      }
      const n = Number(res.headers.get("content-range")?.split("/")[1]);
      if (
        !Number.isSafeInteger(n) ||
        n > 100000 ||
        (total !== undefined && n !== total)
      ) {
        await res.body?.cancel();
        throw new Error(
          "Source coverage changed or exceeded the bounded sync limit.",
        );
      }
      total = n;
      const text = await boundedText(res.body, 8_000_000);
      bytes += text.length;
      if (bytes > 24_000_000)
        throw new Error("Product source exceeds sync size limit.");
      const page = JSON.parse(text) as T[];
      if (!Array.isArray(page)) throw new Error("Invalid product source");
      rows.push(...page);
      if (rows.length === total) return rows;
      if (!page.length || rows.length > total)
        throw new Error("Incomplete product source");
    }
  };
}
export async function collectProduct(env: Env, app: HqApp, key: string) {
  const all = await sourceReader(app, key),
    profiles = await all<Profile>("profiles", "id,created_at");
  const events: Activity[] = [];
  let baseline: DeadsetBaseline | undefined;
  if (app === "deadset") {
    type Inputs = Parameters<typeof calculateBaseline>;
    const [states, subscriptions] = await Promise.all([
      all<Inputs[1][number]>(
        "user_state",
        "user_id,sessions:data->sessions,attribution:data->signupSource",
        "user_id.asc",
      ),
      all<Inputs[2][number]>(
        "subscriptions",
        "user_id,status,environment,current_period_end,cancel_at_period_end",
      ),
    ]);
    baseline = calculateBaseline(profiles, states, subscriptions, new Date());
    for (const state of states)
      if (Array.isArray(state.sessions))
        for (const raw of state.sessions) {
          if (!raw || typeof raw !== "object") continue;
          const s = raw as Record<string, unknown>;
          if (typeof s.id !== "string") continue;
          if (typeof s.startedAt === "string")
            events.push({
              id: s.id,
              user_id: state.user_id,
              at: s.startedAt,
              kind: "session",
            });
          if (
            typeof s.endedAt === "string" &&
            Date.parse(s.endedAt) >= Date.parse(String(s.startedAt))
          )
            events.push({
              id: s.id,
              user_id: state.user_id,
              at: s.endedAt,
              kind: "action",
            });
        }
  } else {
    const [catches, sessions] = await Promise.all([
      all<{
        id: string;
        user_id: string;
        created_at: string;
        notes: string | null;
      }>("catches", "id,user_id,created_at,notes"),
      all<{ id: string; user_id: string; started_at: string }>(
        "fishing_sessions",
        "id,user_id,started_at",
      ),
    ]);
    const legacyNotes = new Set([
      "Caught on a soft plastic at dusk, light onshore wind.",
      "Quick session before sunset, school passing through.",
      "Slow jig over the reef, tide turning.",
    ]);
    for (const c of catches)
      if (!legacyNotes.has(c.notes ?? ""))
        events.push({
          id: c.id,
          user_id: c.user_id,
          at: c.created_at,
          kind: "action",
        });
    for (const s of sessions)
      events.push({
        id: s.id,
        user_id: s.user_id,
        at: s.started_at,
        kind: "session",
      });
  }
  const snapshot = productMetrics(app, profiles, events);
  if (baseline) snapshot.baseline = baseline;
  return snapshot;
}
export async function connectProduct(env: Env, app: HqApp, key: string) {
  const snapshot = await collectProduct(env, app, key);
  await env.HQ_DATA.put(
    `${app}/product-key`,
    await encrypt(key, env.TOKEN_ENCRYPTION_KEY),
  );
  await storeProduct(env, app, snapshot);
  return snapshot;
}
async function storeProduct(env: Env, app: HqApp, snapshot: ProductSnapshot) {
  await env.HQ_DATA.put(`${app}/product/current`, JSON.stringify(snapshot));
  await env.HQ_DATA.put(
    `${app}/product/status`,
    JSON.stringify({
      at: snapshot.captured_at,
      status: "connected",
      error: null,
    }),
  );
  if (snapshot.baseline)
    await env.HQ_DATA.put(
      `deadset/baseline/${snapshot.captured_at.slice(0, 10)}`,
      JSON.stringify(snapshot.baseline),
      { expirationTtl: 370 * 86400 },
    );
}
export async function refreshProduct(env: Env, app: HqApp, force = false) {
  const encrypted = await env.HQ_DATA.get(`${app}/product-key`);
  const fallback = app === "deadset" ? env.DEADSET_PRODUCT_KEY : undefined;
  if (!encrypted && !fallback) return { status: "not_connected" };
  const current = await env.HQ_DATA.get<ProductSnapshot>(
    `${app}/product/current`,
    "json",
  );
  if (
    !force &&
    current &&
    Date.now() - Date.parse(current.captured_at) < 5 * 60000
  )
    return { status: "cached", at: current.captured_at };
  try {
    const snapshot = await collectProduct(
      env,
      app,
      encrypted
        ? await decrypt(encrypted, env.TOKEN_ENCRYPTION_KEY)
        : fallback!,
    );
    await storeProduct(env, app, snapshot);
    return { status: "connected", at: snapshot.captured_at };
  } catch (e) {
    const error = e instanceof Error ? e.message : "Product sync failed";
    await env.HQ_DATA.put(
      `${app}/product/status`,
      JSON.stringify({ at: new Date().toISOString(), status: "error", error }),
    );
    return { status: "error", error };
  }
}
