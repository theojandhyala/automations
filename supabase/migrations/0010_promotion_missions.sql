-- One guided promotion mission can safely coordinate drafting and production
-- while preserving the owner's mandatory review gate before TikTok publishing.

create table public.promotion_missions (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references public.apps(id) on delete cascade,
  account_id uuid references public.tiktok_accounts(id) on delete set null,
  draft_run_id uuid references public.runs(id) on delete set null,
  producer_run_id uuid references public.runs(id) on delete set null,
  status text not null default 'queued',
  goal text not null,
  audience text not null,
  angle text not null,
  content_format text not null,
  draft_count integer not null,
  feature_rotation text[] not null default '{}',
  auto_produce boolean not null default true,
  readiness jsonb not null default '{}'::jsonb,
  created_by text not null,
  error text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  constraint promotion_mission_status check (
    status in ('queued', 'drafting', 'producing', 'awaiting_review', 'failed')
  ),
  constraint promotion_mission_goal check (
    goal in ('downloads', 'feature_discovery', 'trust', 'engagement')
  ),
  constraint promotion_mission_audience check (
    audience in ('new_lifters', 'consistent_lifters', 'serious_gym', 'general_fitness')
  ),
  constraint promotion_mission_angle check (
    angle in ('relatable', 'problem_solution', 'proof', 'routine')
  ),
  constraint promotion_mission_format check (
    content_format in ('photo_carousel', 'video_brief')
  ),
  constraint promotion_mission_count check (draft_count between 1 and 6)
);

alter table public.promotion_missions enable row level security;

create policy owner_read on public.promotion_missions
  for select using (public.is_owner());

create index promotion_missions_created_idx
  on public.promotion_missions (created_at desc);

