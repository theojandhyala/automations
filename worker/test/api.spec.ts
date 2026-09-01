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

  it('queues media production for the scheduled runner instead of a short HTTP background task', async () => {
    let queuedAt: unknown = null;
    let claims = 0;
    stubFetch([
      authRoute,
      {
        match: /\/rest\/v1\/automations\?id=eq/,
        respond: (call) => {
          if (call.method === 'PATCH') {
            const patch = call.body as Record<string, unknown>;
            queuedAt = patch.next_run_at;
            return jsonResponse([automationRow({ handler_key: 'tiktok.produce', ...patch })]);
          }
          return jsonResponse([automationRow({ handler_key: 'tiktok.produce' })]);
        },
      },
      { match: /\/rpc\/claim_automation/, respond: () => { claims++; return jsonResponse([]); } },
    ]);

    const res = await call(apiRequest(`/automations/${AUTOMATION_ID}/run`, { method: 'POST' }));
    expect(res.status).toBe(202);
    expect(await res.json()).toMatchObject({ ok: true, queued: true, automation_id: AUTOMATION_ID });
    expect(queuedAt).toEqual(expect.any(String));
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

  it('cannot rebind an enabled automation onto a release-locked app', async () => {
    const lockedAppId = '33333333-3333-4333-8333-333333333333';
    let automationWrites = 0;
    stubFetch([
      authRoute,
      {
        match: /\/rest\/v1\/automations\?id=eq/,
        respond: (request) => {
          if (request.method === 'PATCH') automationWrites++;
          return jsonResponse([automationRow({ app_id: null, enabled: true })]);
        },
      },
      {
        match: /\/rest\/v1\/apps\?id=eq/,
        respond: () => jsonResponse([{ promotion_enabled: false }]),
      },
    ]);

    const res = await call(apiRequest(`/automations/${AUTOMATION_ID}`, {
      method: 'PATCH',
      body: JSON.stringify({ app_id: lockedAppId }),
    }));

    expect(res.status).toBe(409);
    expect((await res.json() as { error: string }).error).toMatch(/release-locked/);
    expect(automationWrites).toBe(0);
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
    expect(inserted).toMatchObject({ handle: 'deadsetapp', daily_post_limit: 3 });
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
  it('approves a passing draft for manual TikTok handoff without OAuth', async () => {
    let patch: Record<string, unknown> | null = null;
    stubFetch([
      authRoute,
      {
        match: /\/rest\/v1\/artifacts\?id=eq/,
        respond: (call) => {
          if (call.method === 'PATCH') {
            patch = call.body as Record<string, unknown>;
            return jsonResponse([{ id: ARTIFACT_ID, ...patch }]);
          }
          return jsonResponse([{
            id: ARTIFACT_ID,
            status: 'draft',
            stages: { edit: { state: 'done' } },
            media_type: 'photo',
            photo_urls: [
              'https://media.example.test/slide-1.jpg',
              'https://media.example.test/slide-2.jpg',
            ],
            video_url: null,
            hook: 'Would you train this again tomorrow?',
            caption: 'The weekly set map made the answer obvious.',
            hashtags: ['gymtok', 'lifting', 'deadset'],
            asset_manifest: {
              format: 'two_slide_photo_carousel',
              slides: [{ role: 'hook' }, { role: 'feature_proof' }],
              generated_people: false,
              fabricated_ui: false,
            },
          }]);
        },
      },
    ]);

    const res = await call(apiRequest(`/artifacts/${ARTIFACT_ID}/manual-approve`, {
      method: 'POST',
      body: JSON.stringify({ confirmed: true }),
    }));

    expect(res.status).toBe(200);
    expect(patch).toMatchObject({
      status: 'approved',
      account_id: null,
      posting_consent_at: null,
      stage: 'schedule',
      asset_manifest: { manual_handoff: true, creative_quality: { pass: true } },
    });
  });

  it('records a manually uploaded TikTok post for later analytics', async () => {
    let patch: Record<string, unknown> | null = null;
    stubFetch([
      authRoute,
      {
        match: /\/rest\/v1\/artifacts\?id=eq/,
        respond: (call) => {
          if (call.method === 'PATCH') {
            patch = call.body as Record<string, unknown>;
            return jsonResponse([{ id: ARTIFACT_ID, ...patch }]);
          }
          return jsonResponse([{ status: 'approved', stages: { review: { state: 'done' } } }]);
        },
      },
    ]);

    const res = await call(apiRequest(`/artifacts/${ARTIFACT_ID}/manual-publish`, {
      method: 'POST',
      body: JSON.stringify({ post: 'https://www.tiktok.com/@cast/video/1234567890123456789' }),
    }));

    expect(res.status).toBe(200);
    expect(patch).toMatchObject({
      status: 'published',
      tiktok_post_id: '1234567890123456789',
      stage: 'analytics',
    });
  });

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
            hook: 'Would you fish this window or wait?',
            caption: 'I check the conditions before choosing a mark.',
            hashtags: ['fishing', 'angling', 'cast'],
            asset_manifest: {
              format: 'two_slide_photo_carousel',
              slides: [{ role: 'hook' }, { role: 'feature_proof' }],
              generated_people: false,
              fabricated_ui: false,
            },
            video_url: null,
            account_id: ARTIFACT_ID,
            tiktok_privacy_level: 'SELF_ONLY',
            brand_organic_toggle: true,
          }]);
        },
      },
      {
        match: /\/rest\/v1\/tiktok_accounts\?id=eq/,
        respond: () => jsonResponse([{ id: ARTIFACT_ID, status: 'connected', app_id: null }]),
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
      {
        match: /\/rest\/v1\/tiktok_accounts\?id=eq/,
        respond: () => jsonResponse([{ id: ARTIFACT_ID, status: 'connected', app_id: null }]),
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

  it('refuses to route an artifact through another app account', async () => {
    const otherAccount = '33333333-3333-4333-8333-333333333333';
    stubFetch([
      authRoute,
      {
        match: /\/rest\/v1\/artifacts\?id=eq/,
        respond: () => jsonResponse([{ status: 'draft', app_id: 'deadset-app', stages: {} }]),
      },
      {
        match: /\/rest\/v1\/tiktok_accounts\?id=eq/,
        respond: () => jsonResponse([{ id: otherAccount, status: 'connected', app_id: 'cast-app' }]),
      },
    ]);

    const res = await call(
      apiRequest(`/artifacts/${ARTIFACT_ID}`, {
        method: 'PATCH',
        body: JSON.stringify({ account_id: otherAccount }),
      }),
    );

    expect(res.status).toBe(400);
    expect((await res.json() as { error: string }).error).toMatch(/different app workspace/);
  });
});

describe('pipeline honesty', () => {
  it('reports automated intelligence and reusable rendering as genuinely ready', async () => {
    stubFetch([authRoute]);
    const res = await call(apiRequest('/pipeline'));
    const { stages } = (await res.json()) as {
      stages: Array<{ key: string; state: string; blocker: string | null; description: string }>;
    };

    const byKey = Object.fromEntries(stages.map((s) => [s.key, s]));
    for (const key of ['research', 'concept', 'script', 'assets', 'edit']) {
      expect(byKey[key]!.state).toBe('ready');
      expect(byKey[key]!.blocker).toBeNull();
    }
    expect(byKey.edit!.description).toMatch(/bounded paid Browser Run session/);
    // These are wired and configured in the test env.
    expect(byKey['concept']!.state).toBe('ready');
    expect(byKey['assets']!.state).toBe('ready');
    expect(byKey['edit']!.state).toBe('ready');
    expect(byKey['publish']!.state).toBe('ready');
    // These are human steps.
    expect(byKey['review']!.state).toBe('manual');
  });
});

describe('promotion missions', () => {
  const appId = '33333333-3333-4333-8333-333333333333';
  const promotionRoutes = [
    {
      match: /\/rest\/v1\/apps\?promotion_enabled=eq\.true&select=id,slug,name,tagline,accent,promotion_enabled/,
      respond: () => jsonResponse([{ id: appId, slug: 'cast', name: 'Cast', tagline: 'Track it', accent: '#66ddff', promotion_enabled: true }]),
    },
    {
      match: /\/rest\/v1\/tiktok_accounts\?select=id,handle,display_name,app_id,status/,
      respond: () => jsonResponse([{
        id: ARTIFACT_ID,
        handle: 'castapp',
        display_name: 'Cast',
        app_id: appId,
        status: 'connected',
        access_token_enc: 'MUST-NOT-LEAK',
      }]),
    },
    {
      match: /\/rest\/v1\/automations\?handler_key=in/,
      respond: () => jsonResponse([
        automationRow({ id: AUTOMATION_ID, app_id: appId, handler_key: 'tiktok.generate', status: 'idle' }),
        automationRow({ id: '44444444-4444-4444-8444-444444444444', handler_key: 'tiktok.publish', status: 'idle' }),
      ]),
    },
    {
      match: /integration_secrets\?provider=eq\.pexels/,
      respond: () => jsonResponse([{ provider: 'pexels', secret_enc: 'PEXELS-MUST-NOT-LEAK' }]),
    },
    { match: /creative_assets\?app_slug=in\.\(deadset,cast\)/, respond: () => jsonResponse([]) },
    { match: /artifacts\?status=eq\.draft/, respond: () => jsonResponse([]) },
    { match: /artifacts\?error=not\.is\.null/, respond: () => jsonResponse([]) },
  ];

  it('reports capabilities and the permanent review gate without leaking credentials', async () => {
    stubFetch([authRoute, ...promotionRoutes]);
    const res = await call(apiRequest('/promotion/readiness'));
    const text = await res.text();
    expect(res.status).toBe(200);
    expect(text).toContain('"review_required":true');
    expect(text).toContain('"publishing_ready":false');
    expect(text).toContain('"sandbox_publishing_ready":false');
    expect(text).toContain('"tiktok_review_state":"draft"');
    expect(text).not.toContain('MUST-NOT-LEAK');
    expect(text).not.toContain('secret_enc');
    expect(text).not.toContain('access_token_enc');
  });

  it('does not call a carousel review-ready until every final slide pair exists', async () => {
    const draftRunId = '55555555-5555-4555-8555-555555555555';
    stubFetch([
      authRoute,
      {
        match: /\/rest\/v1\/promotion_missions\?select=/,
        respond: () => jsonResponse([{
          id: ARTIFACT_ID,
          app_id: appId,
          draft_run_id: draftRunId,
          status: 'awaiting_review',
          content_format: 'photo_carousel',
          draft_count: 3,
        }]),
      },
      {
        match: /\/rest\/v1\/artifacts\?run_id=in/,
        respond: () => jsonResponse([{ run_id: draftRunId, photo_urls: ['https://a.example/1.jpg', 'https://a.example/2.jpg'] }]),
      },
    ]);
    const res = await call(apiRequest('/promotion/missions'));
    const body = await res.json() as { missions: Array<{ rendered_count: number; render_complete: boolean }> };
    expect(res.status).toBe(200);
    expect(body.missions[0]).toMatchObject({ rendered_count: 1, render_complete: false });
  });

  it('does not launch a carousel with another app’s feature key or claim an agent', async () => {
    let claims = 0;
    let missions = 0;
    stubFetch([
      authRoute,
      ...promotionRoutes,
      { match: /\/rpc\/claim_automation/, respond: () => { claims++; return jsonResponse([]); } },
      { match: /\/rest\/v1\/promotion_missions$/, respond: () => { missions++; return jsonResponse([]); } },
    ]);
    const res = await call(apiRequest('/promotion/missions', {
      method: 'POST',
      body: JSON.stringify({
        app_slug: 'cast',
        account_id: ARTIFACT_ID,
        goal: 'downloads',
        audience: 'new_lifters',
        angle: 'relatable',
        content_format: 'photo_carousel',
        draft_count: 3,
        feature_rotation: ['muscle_diagram'],
        auto_produce: true,
      }),
    }));
    expect(res.status).toBe(400);
    expect((await res.json() as { error: string }).error).toMatch(/not a verified Cast feature/);
    expect(claims).toBe(0);
    expect(missions).toBe(0);
  });

  it('retries a mission when its selected screens are ready even if unrelated app screens are missing', async () => {
    const producerId = '66666666-6666-4666-8666-666666666666';
    const draftRunId = '55555555-5555-4555-8555-555555555555';
    let missionPatch: Record<string, unknown> | null = null;
    let producerPatch: Record<string, unknown> | null = null;
    stubFetch([
      authRoute,
      {
        match: /\/rest\/v1\/promotion_missions\?id=eq/,
        respond: (call) => {
          if (call.method === 'PATCH') {
            missionPatch = call.body as Record<string, unknown>;
            return jsonResponse([{ id: ARTIFACT_ID, ...missionPatch }]);
          }
          return jsonResponse([{
            id: ARTIFACT_ID,
            app_id: appId,
            draft_run_id: draftRunId,
            draft_count: 3,
            content_format: 'photo_carousel',
            feature_rotation: ['muscle_diagram', 'progression_board', 'workout_plan'],
            status: 'failed',
          }]);
        },
      },
      {
        match: /\/rest\/v1\/apps\?promotion_enabled=eq\.true/,
        respond: () => jsonResponse([{ id: appId, slug: 'deadset', name: 'Deadset', tagline: 'Train', accent: '#ff4438', promotion_enabled: true }]),
      },
      { match: /\/rest\/v1\/tiktok_accounts\?select=/, respond: () => jsonResponse([]) },
      {
        match: /\/rest\/v1\/automations\?handler_key=in/,
        respond: () => jsonResponse([
          automationRow({ id: AUTOMATION_ID, app_id: appId, handler_key: 'tiktok.generate' }),
          automationRow({ id: producerId, app_id: appId, handler_key: 'tiktok.produce' }),
        ]),
      },
      { match: /integration_secrets\?provider=eq\.pexels/, respond: () => jsonResponse([{ provider: 'pexels' }]) },
      {
        match: /creative_assets\?app_slug=in\.\(deadset,cast\)/,
        respond: () => jsonResponse([
          { app_slug: 'deadset', asset_key: 'muscle_diagram', mime_type: 'image/png' },
          { app_slug: 'deadset', asset_key: 'progression_board', mime_type: 'image/png' },
          { app_slug: 'deadset', asset_key: 'workout_plan', mime_type: 'image/png' },
        ]),
      },
      { match: /artifacts\?status=eq\.draft/, respond: () => jsonResponse([]) },
      {
        match: new RegExp(`/rest/v1/automations\\?id=eq\\.${producerId}`),
        respond: (call) => {
          if (call.method === 'PATCH') {
            producerPatch = call.body as Record<string, unknown>;
            return jsonResponse([automationRow({ id: producerId, handler_key: 'tiktok.produce', ...producerPatch })]);
          }
          return jsonResponse([automationRow({ id: producerId, app_id: appId, handler_key: 'tiktok.produce' })]);
        },
      },
    ]);

    const res = await call(apiRequest(`/promotion/missions/${ARTIFACT_ID}/retry-production`, { method: 'POST' }));
    expect(res.status).toBe(202);
    expect(await res.json()).toMatchObject({ ok: true, queued: true, mission_id: ARTIFACT_ID });
    expect(missionPatch).toMatchObject({ status: 'producing', error: null, completed_at: null });
    expect(producerPatch).toMatchObject({ next_run_at: expect.any(String) });
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
        match: /\/rest\/v1\/apps\?slug=eq\.deadset/,
        respond: () => jsonResponse([{ id: ARTIFACT_ID, slug: 'deadset', name: 'Deadset', tagline: 'Train', accent: '#ff6644', promotion_enabled: true }]),
      },
      {
        match: /integration_secrets\?provider=eq\.pexels/,
        respond: () => jsonResponse([{ provider: 'pexels', secret_enc: 'MUST-NOT-LEAK' }]),
      },
      { match: /creative_assets\?app_slug=eq\.deadset/, respond: () => jsonResponse([]) },
      { match: /automations\?app_id=eq\./, respond: () => jsonResponse([]) },
    ]);
    const res = await call(apiRequest('/creative-studio'));
    const text = await res.text();
    expect(res.status).toBe(200);
    expect(text).toContain('"configured":true');
    expect(text).not.toContain('MUST-NOT-LEAK');
    expect(text).not.toContain('secret_enc');
  });

  it('reports App Store readiness without returning its encrypted private key', async () => {
    stubFetch([
      authRoute,
      {
        match: /integration_secrets\?provider=eq\.app_store_connect/,
        respond: () => jsonResponse([{ provider: 'app_store_connect', secret_enc: 'PRIVATE-P8-MUST-NOT-LEAK' }]),
      },
      { match: /apple_offer_code_requests\?select=/, respond: () => jsonResponse([]) },
    ]);
    const res = await call(apiRequest('/app-store/status'));
    const text = await res.text();
    expect(res.status).toBe(200);
    expect(text).toContain('"configured":true');
    expect(text).not.toContain('PRIVATE-P8-MUST-NOT-LEAK');
    expect(text).not.toContain('secret_enc');
  });

  it('requires an explicit true confirmation before an Apple production write', async () => {
    stubFetch([authRoute]);
    const res = await call(apiRequest(`/app-store/custom-codes/${ARTIFACT_ID}/confirm`, {
      method: 'POST',
      body: JSON.stringify({ confirmed: false }),
    }));
    expect(res.status).toBe(400);
    expect((await res.json() as { error: string }).error).toMatch(/confirmed/);
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
