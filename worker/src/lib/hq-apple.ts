import { appStoreToken, type AppStoreCredentials } from "./app-store";
import { Db } from "./db";
import { decrypt } from "./crypto";
import {
  parseSalesReport,
  type AppleSettings,
  type HqApp,
  type StoredDay,
} from "./hq-metrics";
import type { Env } from "../types";
export async function appleCredentials(env: Env) {
  const row = await new Db(env).selectOne<{ secret_enc: string }>(
    "integration_secrets",
    "provider=eq.app_store_connect&select=secret_enc",
  );
  return row
    ? (JSON.parse(
        await decrypt(row.secret_enc, env.TOKEN_ENCRYPTION_KEY),
      ) as AppStoreCredentials)
    : null;
}
export async function boundedText(
  body: ReadableStream<Uint8Array> | null,
  cap = 4_000_000,
) {
  if (!body) throw new Error("Empty report");
  const reader = body.getReader();
  let size = 0,
    text = "";
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > cap) {
        await reader.cancel();
        throw new Error("Report exceeds supported size");
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}
export async function syncApple(env: Env, app: HqApp) {
  const settings = await env.HQ_DATA.get<AppleSettings>(
    `${app}/apple-settings`,
    "json",
  );
  if (!settings)
    throw new Error(
      "Choose the Apple app and vendor number in Connections first.",
    );
  const credentials = await appleCredentials(env);
  if (!credentials)
    throw new Error("Connect an App Store Connect reporting key first.");
  const token = await appStoreToken(credentials);
  const errors: string[] = [];
  let saved = 0;
  // Revisit the latest seven complete UTC days, because Apple can revise reports.
  for (let i = 1; i <= 7; i++) {
    const date = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    const query = new URLSearchParams({
      "filter[frequency]": "DAILY",
      "filter[reportType]": "SALES",
      "filter[reportSubType]": "SUMMARY",
      "filter[version]": "1_0",
      "filter[reportDate]": date,
      "filter[vendorNumber]": settings.vendor_number,
    });
    const res = await fetch(
      `https://api.appstoreconnect.apple.com/v1/salesReports?${query}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/a-gzip",
        },
        signal: AbortSignal.timeout(20000),
        redirect: "manual",
      },
    );
    if (!res.ok) {
      await res.body?.cancel();
      if (res.status === 401 || res.status === 403)
        throw new Error(
          "Apple reporting access was rejected. Check the key role and vendor number.",
        );
      errors.push(`${date}: report unavailable (${res.status})`);
      continue;
    }
    const body = res.body?.pipeThrough(new DecompressionStream("gzip")) ?? null;
    const data = parseSalesReport(await boundedText(body), settings, date);
    const stored: StoredDay = {
      source: "app_store_connect",
      description:
        "Apple daily Summary Sales report; positive first-time app units and estimated proceeds, separated by currency.",
      captured_at: new Date().toISOString(),
      data,
    };
    const storageKey = `${app}/day/app_store_connect/${date}`;
    const previous = await env.HQ_DATA.get<StoredDay>(storageKey, "json");
    // Keep the received-at time stable when Apple returns an unchanged report.
    if (!previous || JSON.stringify(previous.data) !== JSON.stringify(data))
      await env.HQ_DATA.put(storageKey, JSON.stringify(stored));
    saved++;
  }
  const result = { saved, errors, at: new Date().toISOString() };
  await env.HQ_DATA.put(`${app}/apple-sync`, JSON.stringify(result));
  return result;
}
