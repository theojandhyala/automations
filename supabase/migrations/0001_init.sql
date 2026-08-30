-- Automations control plane: core schema
-- Everything is single-tenant (one owner) but RLS is on so the anon key is safe
-- to ship in the browser bundle.

create extension if not exists pgcrypto;

-- app.owner_email is a database-level setting, applied once at setup:
--   alter database postgres set app.owner_email = 'you@example.com';
-- See README.md. Until it is set, is_owner() returns false and the dashboard
-- reads nothing -- fail closed.
create or replace function public.is_owner()
returns boolean language sql stable as $$
  select coalesce(
    auth.jwt() ->> 'email' = current_setting('app.owner_email', true),
    false
  );
$$;

-- ---------------------------------------------------------------- apps

create table public.apps (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  tagline     text,
  app_store_url text,
  created_at  timestamptz not null default now()
);

insert into public.apps (slug, name) values
  ('deadset',   'Deadset'),
  ('cast',      'Cast'),
  ('lifescore', 'LifeScore');

-- ---------------------------------------------------------- automations

create type public.automation_status as enum ('idle', 'running', 'failed', 'disabled');

create table public.automations (
  id            uuid primary key default gen_random_uuid(),
  -- maps to a handler in worker/src/automations/registry.ts
  handler_key   text not null,
  name          text not null,
  description   text,
  app_id        uuid references public.apps (id) on delete set null,
  -- 5-field cron, evaluated in UTC. null = manual trigger only.
  cron          text,
  enabled       boolean not null default false,
  status        public.automation_status not null default 'idle',
  -- free-form per-automation settings (account handles, tone, limits, ...)
  config        jsonb not null default '{}'::jsonb,
  next_run_at   timestamptz,
  last_run_at   timestamptz,
  last_run_id   uuid,
  -- consecutive failures; the dispatcher backs off and then trips the breaker
  failure_streak int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index automations_due_idx on public.automations (next_run_at)
  where enabled and status <> 'disabled';

-- ----------------------------------------------------------------- runs

create type public.run_status as enum ('queued', 'running', 'succeeded', 'failed', 'cancelled');
create type public.run_trigger as enum ('cron', 'manual', 'chain');

create table public.runs (
  id            uuid primary key default gen_random_uuid(),
  automation_id uuid not null references public.automations (id) on delete cascade,
  status        public.run_status not null default 'queued',
  trigger       public.run_trigger not null default 'cron',
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  duration_ms   int,
  error         text,
  -- handler-authored summary, e.g. {"drafted": 3, "published": 1}
  result        jsonb
);

create index runs_automation_started_idx on public.runs (automation_id, started_at desc);
create index runs_started_idx on public.runs (started_at desc);

-- ------------------------------------------------------------ run events

create type public.log_level as enum ('debug', 'info', 'warn', 'error');

create table public.run_events (
  id         bigserial primary key,
  run_id     uuid not null references public.runs (id) on delete cascade,
  at         timestamptz not null default now(),
  level      public.log_level not null default 'info',
  message    text not null,
  data       jsonb
);

create index run_events_run_idx on public.run_events (run_id, id);

-- -------------------------------------------------------- tiktok accounts

create type public.account_status as enum ('connected', 'expired', 'revoked', 'error');

create table public.tiktok_accounts (
  id                uuid primary key default gen_random_uuid(),
  handle            text not null unique,
  display_name      text,
  app_id            uuid references public.apps (id) on delete set null,
  open_id           text unique,
  -- OAuth tokens, AES-GCM encrypted by the worker. Never exposed to the client:
  -- RLS below denies select on this table to the anon/authed roles entirely.
  access_token_enc  text,
  refresh_token_enc text,
  token_expires_at  timestamptz,
  status            public.account_status not null default 'error',
  -- posts per day ceiling enforced by the publish automation
  daily_post_limit  int not null default 2,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Client-safe projection of the accounts table (no token columns).
-- security_invoker = false: the view runs as its owner so it can read past the
-- (absent) policies on the base table, and carries its own owner check.
create view public.tiktok_accounts_public
  with (security_invoker = false) as
  select id, handle, display_name, app_id, status, daily_post_limit,
         token_expires_at, created_at
  from public.tiktok_accounts
  where public.is_owner();

-- ------------------------------------------------------------- artifacts
-- A staged video + caption produced by a generation run, moving through
-- draft -> approved -> published. The publish automation only ever picks up
-- rows in 'approved'.

create type public.artifact_status as enum
  ('draft', 'approved', 'publishing', 'published', 'rejected', 'failed');

create table public.artifacts (
  id            uuid primary key default gen_random_uuid(),
  run_id        uuid references public.runs (id) on delete set null,
  app_id        uuid references public.apps (id) on delete set null,
  account_id    uuid references public.tiktok_accounts (id) on delete set null,
  status        public.artifact_status not null default 'draft',
  hook          text,
  caption       text,
  hashtags      text[] not null default '{}',
  -- public URL TikTok's PULL_FROM_URL fetches from (Supabase Storage)
  video_url     text,
  thumbnail_url text,
  duration_s    numeric(6,2),
  -- TikTok's publish id, then the resulting post id once it lands
  publish_id    text,
  tiktok_post_id text,
  error         text,
  scheduled_for timestamptz,
  published_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index artifacts_status_idx on public.artifacts (status, scheduled_for);
create index artifacts_created_idx on public.artifacts (created_at desc);

-- --------------------------------------------------------------- secrets
-- Nothing sensitive lives here; worker credentials are Cloudflare secrets.
-- This is only for per-automation knobs the dashboard should be able to edit.

create table public.settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------- updated_at

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger automations_touch before update on public.automations
  for each row execute function public.touch_updated_at();
create trigger accounts_touch before update on public.tiktok_accounts
  for each row execute function public.touch_updated_at();
create trigger artifacts_touch before update on public.artifacts
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------------- RLS
-- The dashboard reads through the anon key in the browser, so every table is
-- locked to the single owner identified by OWNER_EMAIL. The worker uses the
-- service role key, which bypasses all of this.

alter table public.apps            enable row level security;
alter table public.automations     enable row level security;
alter table public.runs            enable row level security;
alter table public.run_events      enable row level security;
alter table public.tiktok_accounts enable row level security;
alter table public.artifacts       enable row level security;
alter table public.settings        enable row level security;

-- Read-only for the browser. Every mutation goes through the worker's API so
-- it can be logged, rate-limited, and validated in one place.
create policy owner_read on public.apps        for select using (public.is_owner());
create policy owner_read on public.automations for select using (public.is_owner());
create policy owner_read on public.runs        for select using (public.is_owner());
create policy owner_read on public.run_events  for select using (public.is_owner());
create policy owner_read on public.artifacts   for select using (public.is_owner());
create policy owner_read on public.settings    for select using (public.is_owner());

-- No policy on tiktok_accounts: the anon/authenticated roles cannot reach the
-- token columns at all. The dashboard reads tiktok_accounts_public instead.
grant select on public.tiktok_accounts_public to anon, authenticated;
