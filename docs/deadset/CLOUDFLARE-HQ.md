# DEADSET HQ on Cloudflare

Site: https://deadset-hq.theojandhyala.workers.dev

The dedicated `deadset-hq` Worker serves the DEADSET-branded dashboard. It uses the existing automation service through a Cloudflare service binding and preserves its owner authentication, operational APIs and posting approval rules. It does not deploy or modify the automation engine or its cron jobs.

## Build and release

Use a clean checkout of `codex/deadset-hq-publish`. Dependencies remain in the existing web/ and worker/ packages.

```sh
VITE_DEADSET_HQ=true npm --prefix web run build
npm --prefix worker run typecheck
npm --prefix worker test
cd worker
npx wrangler deploy --config wrangler.hq.jsonc --keep-vars
```

The usual automation dashboard build remains unchanged when `VITE_DEADSET_HQ` is absent. Shared review queue supports an optional app filter; HQ supplies `deadset`. External connection management remains at the established automation dashboard.

## Data and authentication

- Log in with the existing automation dashboard owner account using email/password. No registration or alternate privileged session is added.
- All API calls are checked against the existing owner endpoint. The browser uses its existing Supabase anonymous key with owner RLS for operational data.
- `BASELINE` is a private KV namespace. No baseline is embedded in static assets. Private responses are marked no-store; the site is noindex and rejects embedding.
- `DEADSET_SOURCE_KEY` reuses the existing source service credential as a Worker secret. Its only code path makes bounded read-only Supabase requests. Never put it in frontend environment variables or print it.
- The baseline refresh runs hourly at minute 17 UTC. Manual refresh requires the owner session and reuses snapshots younger than five minutes. KV is eventually consistent; an immediate refresh may briefly show the previous snapshot.
- Current and previous snapshots contain aggregate counts only. The collector rejects incomplete coverage and oversized source responses. Failed collection preserves the last successful snapshot; HQ marks snapshots older than two hours as delayed.
- Profiles, synced workouts and live Stripe counts are available. RevenueCat, MRR amounts, store downloads and mature retention events remain explicitly unavailable.

## Validation and rollback

The clean deployment build, typecheck and Worker/Node suites passed. Live unauthenticated baseline requests return 401, and the site shell returns 200 with noindex, frame protection and CSP headers. Owner-session UI verification requires signing in; no authentication bypass was added.

Rollback only the `deadset-hq` Worker to a known version if needed. Keep the private KV snapshots and existing automation service intact. The Supabase 0021 migration is not required by this dedicated KV-based deployment; it remains available for a future consolidated automation-hosted dashboard.

## Owner password recovery

The login screen links to `/reset-password`. Signed-out users can request a Supabase recovery email; a recovered session can set and confirm a new password. Before updating credentials, the client validates its session through the existing `/api/me` owner gate. Credentials are sent directly to Supabase and never embedded in source.

Supabase Auth now permits the exact redirect `https://deadset-hq.theojandhyala.workers.dev/reset-password`; the original default site URL and existing redirects remain unchanged.

Validation: production HQ build and 16 focused recovery/private-API tests passed. Actual owner password entry and submission remain a user handoff.
