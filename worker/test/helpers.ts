import { env } from 'cloudflare:test';
import { vi } from 'vitest';
import type { Env } from '../src/types';

export const testEnv = env as unknown as Env;

export interface StubCall {
  url: string;
  method: string;
  body: unknown;
  headers: Record<string, string>;
}

/**
 * Replaces global fetch with a router over the Supabase / TikTok / Anthropic
 * URLs, so the API and dispatcher can be exercised end to end without a live
 * backend. The recorded calls are how the claim tests assert the atomic RPC was
 * actually used rather than a plain select-then-update.
 */
export function stubFetch(
  routes: Array<{ match: RegExp; respond: (call: StubCall) => Response | Promise<Response> }>,
): { calls: StubCall[] } {
  const calls: StubCall[] = [];

  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET');

    const headers: Record<string, string> = {};
    new Headers(init?.headers ?? {}).forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });

    let body: unknown = null;
    if (typeof init?.body === 'string') {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    }

    const call: StubCall = { url, method, body, headers };
    calls.push(call);

    for (const route of routes) {
      if (route.match.test(url)) return route.respond(call);
    }
    throw new Error(`unstubbed fetch: ${method} ${url}`);
  });

  return { calls };
}

export const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/**
 * Supabase's /auth/v1/user endpoint: returns the owner for OWNER_TOKEN, an
 * unrelated signed-in user for OTHER_TOKEN, and 401 for anything else.
 */
export const OWNER_TOKEN = 'owner-token';
export const OTHER_TOKEN = 'other-token';

export const authRoute = {
  match: /\/auth\/v1\/user/,
  respond: (call: StubCall) => {
    const auth = call.headers['authorization'] ?? '';
    if (auth === `Bearer ${OWNER_TOKEN}`) return jsonResponse({ email: 'owner@example.com' });
    if (auth === `Bearer ${OTHER_TOKEN}`) return jsonResponse({ email: 'someone-else@example.com' });
    return jsonResponse({ message: 'bad jwt' }, 401);
  },
};

export function apiRequest(
  path: string,
  init: RequestInit & { token?: string | null } = {},
): Request {
  const { token = OWNER_TOKEN, ...rest } = init;
  return new Request(`https://example.test/api${path}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...((rest.headers as Record<string, string>) ?? {}),
    },
  });
}

/** A minimal automation row as PostgREST would return it. */
export function automationRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    handler_key: 'system.heartbeat',
    name: 'Heartbeat',
    description: null,
    app_id: null,
    cron: '*/15 * * * *',
    enabled: true,
    status: 'idle',
    config: {},
    next_run_at: '2020-01-01T00:00:00.000Z',
    last_run_at: null,
    running_since: null,
    failure_streak: 0,
    icon: 'heart',
    accent: null,
    kind: 'system',
    orbit_ring: 1,
    orbit_position: 0.5,
    current_task: null,
    ...overrides,
  };
}
