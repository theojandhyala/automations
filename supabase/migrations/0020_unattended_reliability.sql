-- Serialize token rotation and reserve delivery slots before contacting TikTok.
alter table public.tiktok_accounts
  add column if not exists refresh_locked_until timestamptz,
  add column if not exists refresh_token_expires_at timestamptz,
  add column if not exists granted_scopes text,
  add column if not exists token_provider text,
  add column if not exists health jsonb;

create or replace function public.claim_tiktok_refresh(p_account_id uuid)
returns setof public.tiktok_accounts language sql as $$
  update public.tiktok_accounts
     set refresh_locked_until = now() + interval '60 seconds'
   where id = p_account_id
     and (refresh_locked_until is null or refresh_locked_until < now())
  returning *;
$$;
revoke all on function public.claim_tiktok_refresh(uuid) from public, anon, authenticated;
grant execute on function public.claim_tiktok_refresh(uuid) to service_role;

create table if not exists public.tiktok_delivery_slots (
  artifact_id uuid primary key references public.artifacts(id),
  account_id uuid not null references public.tiktok_accounts(id),
  local_day date not null,
  slot text not null,
  reserved_at timestamptz not null default now(),
  unique(account_id, local_day, slot)
);
alter table public.tiktok_delivery_slots enable row level security;
create policy "owner reads delivery reservations" on public.tiktok_delivery_slots
  for select to authenticated using (public.is_owner());

create or replace function public.reserve_tiktok_delivery(p_artifact_id uuid, p_scheduled boolean, p_expected jsonb)
returns boolean language plpgsql as $$
declare
  item public.artifacts;
  account public.tiktok_accounts;
  local_now timestamp := now() at time zone 'Europe/London';
  slot_name text;
begin
  select * into item from public.artifacts where id = p_artifact_id for update;
  if not found or item.status <> 'approved' or item.publish_id is not null then return false; end if;
  if p_expected is null or not (to_jsonb(item) @> p_expected) then return false; end if;
  if item.scheduled_for > now() then return false; end if;
  select * into account from public.tiktok_accounts where id = item.account_id for update;
  if not found or account.status <> 'connected' or account.app_id is distinct from item.app_id then return false; end if;
  if not exists(select 1 from public.apps where id = item.app_id and promotion_enabled
    and slug in ('deadset','cast') and slug = item.asset_manifest->>'app_slug'
    and lower(trim(leading '@' from account.handle)) = case slug when 'deadset' then 'deadset.app' else 'cast.fishing.app' end)
  then return false; end if;
  if exists(select 1 from public.artifacts where account_id = account.id and status = 'publishing') then return false; end if;
  if p_scheduled then
    if extract(hour from local_now) not in (12,15,18) or extract(minute from local_now) >= 5 then return false; end if;
    slot_name := to_char(local_now, 'HH24');
  else slot_name := 'manual:' || p_artifact_id::text;
  end if;
  -- Count in-flight/ambiguous attempts too. A timeout never frees a slot.
  if (select count(*) from (
    select artifact_id as id from public.tiktok_delivery_slots where account_id = account.id and local_day = local_now::date
    union select id from public.artifacts where account_id = account.id and status = 'published'
      and published_at >= (local_now::date::timestamp at time zone 'Europe/London')
  ) counted) >= least(account.daily_post_limit,3) then return false; end if;
  insert into public.tiktok_delivery_slots(artifact_id,account_id,local_day,slot)
    values(item.id,account.id,local_now::date,slot_name) on conflict do nothing;
  if not found then return false; end if;
  update public.artifacts set status='publishing', stage='publish', error=null where id=item.id;
  return true;
end;
$$;
revoke all on function public.reserve_tiktok_delivery(uuid,boolean,jsonb) from public, anon, authenticated;
grant execute on function public.reserve_tiktok_delivery(uuid,boolean,jsonb) to service_role;

-- Scheduling is commissioned separately AFTER the matching Worker is deployed.
-- Existing schedules, enablement, brand assignments and reviewed media are untouched.
