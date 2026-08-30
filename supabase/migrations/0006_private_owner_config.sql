-- Hosted Supabase projects do not allow arbitrary database-level GUCs such as
-- app.owner_email. Keep the single-owner allowlist in a private schema instead.

create schema if not exists private;

create table if not exists private.owner_config (
  email text primary key,
  created_at timestamptz not null default now()
);

revoke all on schema private from public, anon, authenticated;
revoke all on table private.owner_config from public, anon, authenticated;

insert into private.owner_config (email)
values ('theojandhyala@icloud.com')
on conflict (email) do nothing;

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.owner_config
    where email = (select auth.jwt() ->> 'email')
  );
$$;

revoke all on function public.is_owner() from public;
grant execute on function public.is_owner() to anon, authenticated;
