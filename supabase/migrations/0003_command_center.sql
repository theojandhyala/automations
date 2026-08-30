-- Second pass: agent metadata for the command center, the honest multi-stage
-- pipeline, analytics + daily reports, and an atomic claim so an automation
-- cannot be started twice.

-- ------------------------------------------------- workspaces (per app)
-- Deadset / Cast / LifeScore are visibly separate workspaces on the canvas,
-- each with its own accent and its own agents.

alter table public.apps add column accent text not null default '#6ea8fe';
alter table public.apps add column icon text not null default 'sparkle';
alter table public.apps add column sort_order int not null default 0;

update public.apps set accent = '#f0724a', icon = 'target',  sort_order = 0 where slug = 'deadset';
update public.apps set accent = '#7c5cff', icon = 'wave',    sort_order = 1 where slug = 'cast';
update public.apps set accent = '#2fd4a0', icon = 'pulse',   sort_order = 2 where slug = 'lifescore';

-- ------------------------------------------------------- agent metadata
-- An automation IS an agent. These columns are purely how it presents on the
-- command center: which glyph, which accent, where it sits around the core.

alter table public.automations add column icon text not null default 'gear';
alter table public.automations add column accent text;
-- 'app' agents belong to one product workspace; 'system' agents serve them all.
alter table public.automations add column kind text not null default 'system'
  check (kind in ('app', 'system'));
-- Position on the orbit ring, 0..1 around the circle. Null lets the client
-- lay the agent out automatically.
alter table public.automations add column orbit_ring int not null default 1;
alter table public.automations add column orbit_position numeric(5,4);
-- Short human sentence shown under the agent while it is working.
alter table public.automations add column current_task text;

-- -------------------------------------------------------- pipeline stages
-- The real production pipeline, most of which is NOT yet wired. Recording it
-- explicitly is what keeps the dashboard honest: a stage with no handler
-- reports 'not_configured' rather than quietly looking finished.

create type public.pipeline_stage as enum (
  'research', 'concept', 'script', 'assets', 'edit',
  'review', 'schedule', 'publish', 'analytics'
);

alter table public.artifacts add column stage public.pipeline_stage not null default 'concept';
-- Per-stage record: {"concept": {"state": "done", "at": "...", "note": "..."}}
-- state is one of done | pending | not_configured | failed | skipped.
alter table public.artifacts add column stages jsonb not null default '{}'::jsonb;
-- Filming and editing instructions. Previously these were only written to the
-- run log, so the review queue lost them entirely.
alter table public.artifacts add column shot_notes text;
alter table public.artifacts add column script text;

create index artifacts_stage_idx on public.artifacts (stage);

-- ----------------------------------------------------- analytics snapshots
-- Point-in-time account metrics. One row per account per sync; the dashboard
-- charts the deltas between them.

create table public.analytics_snapshots (
  id             uuid primary key default gen_random_uuid(),
  account_id     uuid not null references public.tiktok_accounts (id) on delete cascade,
  app_id         uuid references public.apps (id) on delete set null,
  captured_at    timestamptz not null default now(),
  followers      int,
  following      int,
  likes_total    bigint,
  video_count    int,
  -- Rolling-window metrics, when the granted scopes expose them.
  views_28d      bigint,
  watch_time_min numeric(12,2),
  comments_28d   int,
  shares_28d     int,
  -- 'ok' when TikTok returned data, 'partial' when some scopes were missing,
  -- 'unavailable' when analytics are not set up at all.
  quality        text not null default 'ok' check (quality in ('ok', 'partial', 'unavailable')),
  raw            jsonb
);

create index analytics_account_idx on public.analytics_snapshots (account_id, captured_at desc);

-- Per-post metrics, keyed back to the artifact that produced the post.
create table public.post_metrics (
  id          uuid primary key default gen_random_uuid(),
  artifact_id uuid references public.artifacts (id) on delete cascade,
  account_id  uuid not null references public.tiktok_accounts (id) on delete cascade,
  tiktok_post_id text not null,
  captured_at timestamptz not null default now(),
  views       bigint,
  likes       int,
  comments    int,
  shares      int,
  watch_time_min numeric(12,2),
  unique (tiktok_post_id, captured_at)
);

create index post_metrics_artifact_idx on public.post_metrics (artifact_id, captured_at desc);

-- ---------------------------------------------------------- daily reports
-- The 08:00 morning report. Generation and delivery are separate concerns:
-- a report can exist and be readable in the dashboard while delivery is still
-- unconfigured.

create table public.daily_reports (
  id            uuid primary key default gen_random_uuid(),
  for_date      date not null unique,
  generated_at  timestamptz not null default now(),
  run_id        uuid references public.runs (id) on delete set null,
  headline      text,
  summary       text,
  -- [{"title": "...", "lines": ["..."], "tone": "ok|warn|bad"}]
  sections      jsonb not null default '[]'::jsonb,
  metrics       jsonb not null default '{}'::jsonb,
  delivery      text not null default 'unconfigured'
                check (delivery in ('unconfigured', 'pending', 'sent', 'failed')),
  delivery_error text
);

create index daily_reports_date_idx on public.daily_reports (for_date desc);

-- ------------------------------------------------------------------- RLS

alter table public.analytics_snapshots enable row level security;
alter table public.post_metrics        enable row level security;
alter table public.daily_reports       enable row level security;

create policy owner_read on public.analytics_snapshots for select using (public.is_owner());
create policy owner_read on public.post_metrics        for select using (public.is_owner());
create policy owner_read on public.daily_reports       for select using (public.is_owner());
