import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index';
import {
  OTHER_TOKEN,
  apiRequest,
  authRoute,
  automationRow,
  jsonResponse,
  stubFetch,
  testEnv,
} from './helpers';

afterEach(() => vi.unstubAllGlobals());

async function call(req: Request): Promise<Response> {
  const ctx = createExecutionContext();
  const res = await worker.fetch(req, testEnv, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

const AUTOMATION_ID = '11111111-1111-4111-8111-111111111111';
const ARTIFACT_ID = '22222222-2222-4222-8222-222222222222';

describe('auth', () => {
  it('rejects a request with no token', async () => {
    stubFetch([authRoute]);
    const res = await call(apiRequest('/me', { token: null }));
    expect(res.status).toBe(401);
  });

  it('rejects a signed-in user who is not the owner', async () => {
    // The critical check: a valid Supabase session for someone else must not
    // reach the control plane.
    stubFetch([authRoute]);
    const res = await call(apiRequest('/me', { token: OTHER_TOKEN }));
    expect(res.status).toBe(401);
  });

  it('rejects a token Supabase does not recognise', async () => {
    stubFetch([authRoute]);
    const res = await call(apiRequest('/me', { token: 'garbage' }));
    expect(res.status).toBe(401);
  });

  it('admits the owner', async () => {
    stubFetch([authRoute]);
    const res = await call(apiRequest('/me'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ email: 'owner@example.com' });
  });

  it('never runs an automation for a non-owner', async () => {
    let claims = 0;
    stubFetch([
      authRoute,
      { match: /\/rpc\/claim_automation/, respond: () => { claims++; return jsonResponse([automationRow()]); } },
      { match: /\/rest\/v1\/automations\?id=eq/, respond: () => jsonResponse([automationRow()]) },
    ]);

    const res = await call(
      apiRequest(`/automations/${AUTOMATION_ID}/run`, { method: 'POST', token: OTHER_TOKEN }),
    );

    expect(res.status).toBe(401);
    expect(claims).toBe(0);
  });
});

describe('validation', () => {
  it('rejects a non-JSON body with 400, not 500', async () => {
    stubFetch([authRoute]);
    const res = await call(
      apiRequest('/automations', { method: 'POST', body: 'not json' }),
    );
    expect(res.status).toBe(400);
    expect((await res.json() as { error: string }).error).toMatch(/valid JSON/);
  });

  it('rejects an invalid cron expression', async () => {
    stubFetch([authRoute]);
    const res = await call(
      apiRequest('/automations', {
        method: 'POST',
        body: JSON.stringify({ handler_key: 'system.heartbeat', name: 'x', cron: '99 * * * *' }),
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json() as { error: string }).error).toMatch(/cron/);
  });

  it('rejects a handler config that does not match its schema', async () => {
    stubFetch([
      authRoute,
      { match: /\/rest\/v1\/automations\?id=eq/, respond: () => jsonResponse([automationRow({ handler_key: 'tiktok.generate' })]) },
    ]);
    // count must be an integer 1..10.
    const res = await call(
      apiRequest(`/automations/${AUTOMATION_ID}`, {
        method: 'PATCH',
        body: JSON.stringify({ config: { app_slug: 'deadset', count: 99 } }),
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json() as { error: string }).error).toMatch(/config\.count/);
  });

  it('rejects an empty patch rather than issuing a no-op write', async () => {
    stubFetch([
      authRoute,
      { match: /\/rest\/v1\/automations\?id=eq/, respond: () => jsonResponse([automationRow()]) },
    ]);
    const res = await call(
      apiRequest(`/automations/${AUTOMATION_ID}`, { method: 'PATCH', body: '{}' }),
    );
    expect(res.status).toBe(400);
  });

  it('rejects a video_url that is not a URL', async () => {
    stubFetch([
      authRoute,
      { match: /\/rest\/v1\/artifacts\?id=eq/, respond: () => jsonResponse([{ status: 'draft', stages: {} }]) },
    ]);
    const res = await call(
      apiRequest(`/artifacts/${ARTIFACT_ID}`, {
        method: 'PATCH',
        body: JSON.stringify({ video_url: 'definitely-not-a-url' }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it('strips a leading @ from an account handle', async () => {
    let inserted: unknown = null;
    stubFetch([
      authRoute,
      {
        match: /\/rest\/v1\/tiktok_accounts$/,
        respond: (call) => {
          inserted = call.body;
          return jsonResponse([{ id: ARTIFACT_ID }]);
        },
      },
    ]);
    const res = await call(
      apiRequest('/tiktok/accounts', { method: 'POST', body: JSON.stringify({ handle: '@deadsetapp' }) }),
    );
    expect(res.status).toBe(201);
    expect(inserted).toMatchObject({ handle: 'deadsetapp', daily_post_limit: 2 });
  });

  it('rejects a handle with characters TikTok does not allow', async () => {
    stubFetch([authRoute]);
    const res = await call(
      apiRequest('/tiktok/accounts', { method: 'POST', body: JSON.stringify({ handle: 'bad handle!' }) }),
    );
    expect(res.status).toBe(400);
  });
});

describe('artifact transitions', () => {
  it('refuses a move the state machine does not allow', async () => {
    stubFetch([
      authRoute,
      { match: /\/rest\/v1\/artifacts\?id=eq/, respond: () => jsonResponse([{ status: 'published', stages: {} }]) },
    ]);
    const res = await call(
      apiRequest(`/artifacts/${ARTIFACT_ID}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'draft' }),
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json() as { error: string }).error).toMatch(/cannot move published -> draft/);
  });

  it('records the review stage when a draft is approved', async () => {
    let patch: Record<string, unknown> | null = null;
    stubFetch([
      authRoute,
      {
        match: /\/rest\/v1\/artifacts\?id=eq/,
        respond: (call) => {
          if (call.method === 'PATCH') {
            patch = call.body as Record<string, unknown>;
            return jsonResponse([{ id: ARTIFACT_ID }]);
          }
          return jsonResponse([{
            status: 'draft',
            stages: { concept: { state: 'done' } },
            media_type: 'photo',
            photo_urls: [
              'https://media.example.test/slide-1.jpg',
              'https://media.example.test/slide-2.jpg',
            ],
            video_url: null,
            account_id: ARTIFACT_ID,
            tiktok_privacy_level: 'SELF_ONLY',
            brand_organic_toggle: true,
          }]);
        },
      },
    ]);

    const res = await call(
      apiRequest(`/artifacts/${ARTIFACT_ID}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'approved', posting_consent: true }),
      }),
    );

    expect(res.status).toBe(200);
    expect(patch).toMatchObject({ status: 'approved', stage: 'schedule' });
    const stages = (patch as unknown as { stages: Record<string, { state: string }> }).stages;
    // The concept stage survives the approval rather than being overwritten.
    expect(stages['concept']?.state).toBe('done');
    expect(stages['review']?.state).toBe('done');
  });

  it('refuses approval without explicit TikTok posting consent', async () => {
    stubFetch([
      authRoute,
      {
        match: /\/rest\/v1\/artifacts\?id=eq/,
        respond: () => jsonResponse([{
          status: 'draft',
          stages: {},
          media_type: 'photo',
          photo_urls: ['https://media.example.test/slide.jpg'],
          video_url: null,
          account_id: ARTIFACT_ID,
          tiktok_privacy_level: 'SELF_ONLY',
          brand_organic_toggle: true,
        }]),
      },
    ]);

    const res = await call(
      apiRequest(`/artifacts/${ARTIFACT_ID}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'approved' }),
      }),
    );

    expect(res.status).toBe(400);
    expect((await res.json() as { error: string }).error).toMatch(/consent/);
  });
});

describe('pipeline honesty', () => {
  it('reports unbuilt stages as not_built, never as ready', async () => {
    stubFetch([authRoute]);
    const res = await call(apiRequest('/pipeline'));
    const { stages } = (await res.json()) as {
      stages: Array<{ key: string; state: string; blocker: string | null }>;
    };

    const byKey = Object.fromEntries(stages.map((s) => [s.key, s]));
    // These have no handler at all and must say so.
    for (const key of ['research', 'script']) {
      expect(byKey[key]!.state).toBe('not_built');
      expect(byKey[key]!.blocker).toBeTruthy();
    }
    // These are wired and configured in the test env.
    expect(byKey['concept']!.state).toBe('ready');
    expect(byKey['assets']!.state).toBe('ready');
    expect(byKey['edit']!.state).toBe('ready');
    expect(byKey['publish']!.state).toBe('ready');
    // These are human steps.
    expect(byKey['review']!.state).toBe('manual');
  });
});

describe('token safety', () => {
  it('never echoes encrypted tokens back to the browser', async () => {
    stubFetch([
      authRoute,
      {
        match: /\/rest\/v1\/tiktok_accounts\?id=eq/,
        respond: () =>
          jsonResponse([
            {
              id: ARTIFACT_ID,
              handle: 'deadsetapp',
              access_token_enc: 'SECRET-ACCESS',
              refresh_token_enc: 'SECRET-REFRESH',
            },
          ]),
      },
    ]);

    const res = await call(
      apiRequest(`/tiktok/accounts/${ARTIFACT_ID}`, {
        method: 'PATCH',
        body: JSON.stringify({ daily_post_limit: 3 }),
      }),
    );

    const text = await res.text();
    expect(res.status).toBe(200);
    expect(text).not.toContain('SECRET-ACCESS');
    expect(text).not.toContain('SECRET-REFRESH');
  });

  it('reports a connected stock provider without returning its encrypted key', async () => {
    stubFetch([
      authRoute,
      {
        match: /integration_secrets\?provider=eq\.pexels/,
        respond: () => jsonResponse([{ provider: 'pexels', secret_enc: 'MUST-NOT-LEAK' }]),
      },
      { match: /creative_assets\?app_slug=eq\.deadset/, respond: () => jsonResponse([]) },
    ]);
    const res = await call(apiRequest('/creative-studio'));
    const text = await res.text();
    expect(res.status).toBe(200);
    expect(text).toContain('"configured":true');
    expect(text).not.toContain('MUST-NOT-LEAK');
    expect(text).not.toContain('secret_enc');
  });
});

describe('creative media', () => {
  it('accepts a bounded exact Deadset screen upload through the owner API', async () => {
    stubFetch([
      authRoute,
      { match: /\/storage\/v1\/object\/automation-media\/features\//, respond: () => jsonResponse({ Key: 'ok' }) },
      {
        match: /\/rest\/v1\/creative_assets\?on_conflict=/,
        respond: () => jsonResponse([{ id: ARTIFACT_ID, asset_key: 'muscle_diagram' }]),
      },
    ]);
    const form = new FormData();
    form.set('asset_key', 'muscle_diagram');
    form.set('file', new File([new Uint8Array([1, 2, 3])], 'screen.png', { type: 'image/png' }));
    const res = await call(new Request('https://example.test/api/creative-assets', {
      method: 'POST',
      headers: { Authorization: 'Bearer owner-token' },
      body: form,
    }));
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ asset_key: 'muscle_diagram' });
  });

  it('streams only deliberate media paths with immutable caching', async () => {
    stubFetch([{
      match: /\/storage\/v1\/object\/authenticated\/automation-media\/outputs\/draft\/slide\.jpg/,
      respond: () => new Response(new Uint8Array([7, 8, 9]), { headers: { 'Content-Type': 'image/jpeg' } }),
    }]);
    const res = await call(new Request('https://example.test/media/outputs/draft/slide.jpg'));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/jpeg');
    expect(res.headers.get('Cache-Control')).toContain('immutable');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([7, 8, 9]));
  });
});

describe('oauth state', () => {
  it('refuses a forged callback state', async () => {
    stubFetch([authRoute]);
    const res = await call(
      new Request('https://example.test/api/tiktok/callback?code=abc&state=forged.signature'),
    );
    expect(res.status).toBe(400);
    expect((await res.json() as { error: string }).error).toMatch(/invalid or expired state/);
  });

  it('refuses a callback with no state at all', async () => {
    stubFetch([authRoute]);
    const res = await call(new Request('https://example.test/api/tiktok/callback?code=abc'));
    expect(res.status).toBe(400);
  });
});
