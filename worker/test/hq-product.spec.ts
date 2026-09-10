import { describe, it, expect, vi } from "vitest";
import { env } from "cloudflare:test";
import {
  productMetrics,
  collectProduct,
  refreshProduct,
} from "../src/lib/hq-product";
import type { Env } from "../src/types";
import { encrypt } from "../src/lib/crypto";
const profiles = [
  { id: "a", created_at: "2026-08-01T10:00:00Z" },
  { id: "b", created_at: "2026-08-01T12:00:00Z" },
  { id: "c", created_at: "2026-09-09T12:00:00Z" },
];
describe("Live product collection", () => {
  it("computes signup-cohort retention only after the full activity day matures", () => {
    const data = productMetrics(
      "cast",
      profiles,
      [
        {
          id: "catch",
          user_id: "a",
          at: "2026-08-02T12:00:00Z",
          kind: "action",
        },
        {
          id: "session",
          user_id: "a",
          at: "2026-08-08T12:00:00Z",
          kind: "session",
        },
      ],
      new Date("2026-09-10T20:00:00Z"),
    );
    expect(data.days.find((d) => d.date === "2026-08-01")).toMatchObject({
      signups: 2,
      retention_d1: 50,
      retention_d7: 50,
      retention_d30: 0,
    });
    expect(
      data.days.find((d) => d.date === "2026-09-09")?.retention_d1,
    ).toBeNull();
    expect(
      data.days.find((d) => d.date === "2026-08-03")?.retention_d1,
    ).toBeNull();
  });
  it("deduplicates activity, excludes orphans and future dates, and never returns identities", () => {
    const event = {
      id: "x",
      user_id: "a",
      at: "2026-09-10T10:00:00Z",
      kind: "action" as const,
    };
    const data = productMetrics(
      "deadset",
      profiles,
      [
        event,
        event,
        { ...event, id: "y", user_id: "unknown" },
        { ...event, id: "z", at: "2099-01-01T00:00:00Z" },
      ],
      new Date("2026-09-10T20:00:00Z"),
    );
    expect(data.excluded_records).toBe(3);
    expect(data.activity_users_24h).toBe(1);
    expect(data.actions_total).toBe(1);
    expect(JSON.stringify(data)).not.toContain("user_id");
  });
  it("rejects public keys instead of mistaking RLS-filtered empty data for full coverage", async () => {
    await expect(
      collectProduct(env as Env, "cast", "sb_publishable_public_key"),
    ).rejects.toThrow("server-side");
  });
  it("preserves successful snapshots and reports collection failures", async () => {
    const e = env as Env;
    await e.HQ_DATA.put(
      "cast/product-key",
      await encrypt(
        "sb_secret_example_server_key_for_tests",
        e.TOKEN_ENCRYPTION_KEY,
      ),
    );
    await e.HQ_DATA.put(
      "cast/product/current",
      JSON.stringify({
        captured_at: "2026-01-01T00:00:00Z",
        registered_users: 7,
      }),
    );
    const f = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("", { status: 401 }));
    try {
      expect((await refreshProduct(e, "cast", true)).status).toBe("error");
      expect(
        (
          await e.HQ_DATA.get<{ registered_users: number }>(
            "cast/product/current",
            "json",
          )
        )?.registered_users,
      ).toBe(7);
    } finally {
      f.mockRestore();
      await e.HQ_DATA.delete("cast/product-key");
      await e.HQ_DATA.delete("cast/product/current");
      await e.HQ_DATA.delete("cast/product/status");
    }
  });
});
