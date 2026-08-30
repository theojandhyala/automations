# automations

A private control plane for my automations. One Cloudflare Worker serves the
dashboard and its API, runs the scheduler, and executes the automation handlers;
Supabase holds the data and handles sign-in.

The first automations it runs promote **Deadset**, **Cast** and **LifeScore** on
TikTok: a drafting step writes video concepts into a review queue, and a publish
step sends the ones I approve through TikTok's Content Posting API.

```
web/       React dashboard (Vite), built into web/dist
worker/    Cloudflare Worker: API + cron dispatcher + automation handlers
supabase/  SQL migrations
```

The dashboard opens on a command center: every automation is an agent node
orbiting a central core, with its live state (idle / working / failed), today's
schedule along the bottom, and a command bar. Clicking an agent opens its
"brain" — current task, schedule, health, config, logs and outputs. The table
views are still there behind it, one click away and unchanged.

## How it fits together

```
cron (every minute) ──► dispatcher ──► handler ──► run + run_events rows
                                          │
                                          └──► artifacts (draft)
                                                   │  approve in dashboard
                                                   ▼
                                          tiktok.publish ──► TikTok
                                                   │
                                          tiktok.reconcile ──► published / failed
```

The dispatcher wakes every minute, picks up automations whose `next_run_at` has
passed, and runs them. Every run gets a row in `runs` and a buffered log in
`run_events`, which is what the dashboard reads. Five consecutive failures trip a
breaker and disable the automation rather than letting it fail on a schedule
forever.

**Nothing posts without a human.** `tiktok.generate` only ever writes `draft`
artifacts. The publisher picks up `approved` ones, and approval requires a video
URL and an account, set by hand in the review queue.

Claiming is atomic. The dispatcher calls `claim_due_automations()`, which flips
rows to `running` in the same statement that selects them, under
`FOR UPDATE SKIP LOCKED`. Two overlapping dispatchers — or a manual trigger
racing the cron pass — partition the work instead of both running the same
automation. A claim that is never released (worker eviction mid-run) goes stale
after 15 minutes and can be re-taken.

## What is not built

The production pipeline has nine stages. Four of them have no implementation,
and the dashboard says so rather than implying otherwise — the pipeline rail
labels them **Not built**, and `GET /api/pipeline` is the source of that truth.

| Stage | State |
| --- | --- |
| Research | Not built |
| Concept | Automated (`tiktok.generate`) |
| Script | Not built |
| Assets / footage | Not built — you supply the footage |
| Edit / render | Not built |
| Review | You do this, in the queue |
| Schedule | You do this |
| Publish | Automated (`tiktok.publish`) |
| Analytics | Automated (`analytics.sync`) |

So: **the pipeline drafts concepts, it does not make videos.** A draft carries a
hook, caption, hashtags and shot notes; turning that into a file is still manual,
and the approve step will not let anything through without a video URL.

Two more things are deliberately unconfigured:

- **Report delivery.** The 08:00 report is generated and readable in the
  dashboard, but no push/email channel is wired, so `delivery` stays
  `unconfigured` and the UI states that nothing was sent.
- **Analytics scopes.** `analytics.sync` needs `user.info.stats` and
  `video.list`, which are separate from the posting scopes. Without them a
  snapshot is recorded with quality `partial` rather than as zeroes.

## Automations

| Handler key | What it does |
| --- | --- |
| `system.heartbeat` | Records a run so you can confirm the dispatcher is healthy. |
| `tiktok.generate` | Drafts hooks/captions/shot notes for one app. Config: `{app_slug, count, account_id?, extra_context?}` |
| `tiktok.publish` | Publishes approved artifacts within each account's daily limit. Config: `{max_per_run}` |
| `tiktok.reconcile` | Polls TikTok and settles in-flight posts. |
| `analytics.sync` | Pulls follower/view/per-post metrics. Config: `{lookback_posts}` |
| `report.daily` | Builds the 08:00 morning report. |
| `pipeline.audit` | Flags stuck artifacts, expiring tokens and unwired stages. |

Adding one: write a handler in `worker/src/automations/`, export it, add it to
`HANDLERS` in `registry.ts`. It gets logging, run history, scheduling, retries
and the kill switch for free.

## Setup

### 1. Supabase

Create a project, then run every numbered file in `supabase/migrations/` in
order (`0001` through `0005` at the time of writing). Then pin the owner —
until you do, the dashboard reads nothing:

```sql
alter database postgres set app.owner_email = 'you@example.com';
```

Under **Authentication → Providers**, leave Email on with magic links, and turn
**off** new user sign-ups so nobody else can create an account.

### 2. Worker

```bash
cd worker
npm install
```

Set the non-secret vars in `wrangler.jsonc` (`SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`OWNER_EMAIL`), then the secrets:

```bash
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
wrangler secret put TOKEN_ENCRYPTION_KEY   # openssl rand -base64 32
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put TIKTOK_CLIENT_KEY
wrangler secret put TIKTOK_CLIENT_SECRET
wrangler secret put TIKTOK_REDIRECT_URI    # https://<worker>/api/tiktok/callback
```

`TOKEN_ENCRYPTION_KEY` must be 32 bytes base64. It encrypts the TikTok OAuth
tokens at rest, so a database dump on its own does not hand over posting access.

### 3. Deploy

```bash
cd web && npm install && npm run build     # needs VITE_SUPABASE_URL / _ANON_KEY
cd ../worker && npm run deploy
```

The Worker serves `web/dist` directly, so that is one deploy, no CORS.

### 4. TikTok

In the TikTok developer console: create an app, request `video.publish`,
`video.upload` and `user.info.basic`, set the redirect URI to
`https://<worker>/api/tiktok/callback`, and verify the domain your videos will
be served from — `PULL_FROM_URL` refuses unverified domains. Then add each
account on the Accounts page and hit Connect.

Until the app passes TikTok's audit it stays in sandbox mode: posts land as
private drafts only, visible to the account owner.

### 5. First run

Enable `Heartbeat` first and confirm runs appear on the overview. Then enable
the drafting automations, look at what lands in the queue, and only enable
`tiktok.publish` and `tiktok.reconcile` once you are happy with the drafts.

## Local development

```bash
cd worker && npx wrangler dev        # API on :8787
cd web    && npm run dev             # dashboard on :5173, proxies /api
```

Worker secrets go in `worker/.dev.vars` (gitignored), web vars in `web/.env`.

```bash
cd worker && npm test                # Workers-runtime specs + node cron tests
cd worker && npm run test:workers    # vitest inside workerd only
cd worker && npm run typecheck
cd worker && npm run types           # regenerate worker-configuration.d.ts
cd worker && npm run types:check     # verify generated bindings are current
cd web    && npm run build           # typechecks too
```

The Worker tests run inside workerd via `@cloudflare/vitest-pool-workers`, so
the crypto, fetch and Request/Response behaviour under test is the same runtime
that serves production. They cover the atomic claim and manual-trigger
idempotency, the owner-only auth paths, request validation, artifact state
transitions, and that encrypted tokens never reach the browser. Bindings come
from `wrangler types`; `src/types.ts` widens them rather than duplicating the
list.

## Security notes

- The service role key lives only in the Worker. The browser gets the anon key,
  which RLS restricts to rows the owner can read.
- All writes go through the Worker API so they can be validated and logged in
  one place; the browser has read-only database access.
- TikTok tokens are AES-GCM encrypted and the columns holding them have no RLS
  policy at all, so the anon key cannot reach them under any query. The
  dashboard reads the `tiktok_accounts_public` view instead.
- The OAuth callback has no session, so the account being connected travels in
  an HMAC-signed `state` that expires after ten minutes.
- Request bodies and per-handler configs are validated with zod schemas at the
  API boundary, so a malformed body is a 400 rather than a surprise write.
- **Stop everything** on the command center disables every automation at once.

## One thing worth knowing

Running several accounts that post similar promotional content for the same apps
is close to what TikTok's spam and platform manipulation policies target, and
enforcement usually hits every linked account at once. The per-account daily
limit and the manual approval gate are here to keep the volume and the sameness
down; genuinely different content per account is the part that actually matters.
