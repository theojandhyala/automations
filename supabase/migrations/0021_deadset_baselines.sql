-- Aggregate snapshots only. No user identities, credentials or workout payloads.
create table public.deadset_baselines (
  id uuid primary key default gen_random_uuid(),
  captured_at timestamptz not null unique,
  imported_at timestamptz not null default now(),
  payload jsonb not null check (jsonb_typeof(payload) = 'object')
);
alter table public.deadset_baselines enable row level security;
revoke all on public.deadset_baselines from anon, authenticated, service_role;
grant select on public.deadset_baselines to authenticated;
grant select, insert on public.deadset_baselines to service_role;
create policy "Owner reads DEADSET baseline" on public.deadset_baselines
  for select to authenticated using (public.is_owner());
-- Imports use an owner-authenticated Worker. No browser writes or updates.
