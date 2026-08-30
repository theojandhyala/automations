-- Fixes the dispatch race: previously the dispatcher selected due rows and only
-- marked them 'running' once executeRun had already started, so a cron pass
-- overlapping a manual trigger (or a slow pass overlapping the next one) could
-- run the same automation twice.
--
-- Claiming is now a single statement. FOR UPDATE SKIP LOCKED means concurrent
-- callers partition the due set between them instead of contending for it, and
-- the status flip happens inside the same transaction as the select.

-- A run that dies without settling (worker eviction, CPU limit) would otherwise
-- leave the automation stuck 'running' forever. Track when the claim was taken
-- so a stale one can be reclaimed.
alter table public.automations add column running_since timestamptz;

-- How long a claim is honoured before another dispatcher may take it over.
create or replace function public.claim_stale_after()
returns interval language sql immutable as $$ select interval '15 minutes' $$;

/**
 * Atomically claim up to p_limit automations that are due, flipping each to
 * 'running' and returning the rows actually claimed. A row already 'running'
 * within the staleness window is never returned.
 */
create or replace function public.claim_due_automations(p_limit int default 20)
returns setof public.automations
language plpgsql
as $$
begin
  return query
  with due as (
    select a.id
    from public.automations a
    where a.enabled
      and a.status <> 'disabled'
      and a.cron is not null
      and a.next_run_at is not null
      and a.next_run_at <= now()
      and (
        a.status <> 'running'
        or a.running_since is null
        or a.running_since < now() - public.claim_stale_after()
      )
    order by a.next_run_at asc
    limit p_limit
    for update skip locked
  )
  update public.automations a
     set status = 'running',
         running_since = now()
    from due
   where a.id = due.id
  returning a.*;
end;
$$;

/**
 * Claim one specific automation for a manual run. Returns zero rows if it is
 * already running, which the API surfaces as a 409 rather than starting a
 * second concurrent run.
 */
create or replace function public.claim_automation(p_id uuid)
returns setof public.automations
language plpgsql
as $$
begin
  return query
  with target as (
    select a.id
    from public.automations a
    where a.id = p_id
      and a.status <> 'disabled'
      and (
        a.status <> 'running'
        or a.running_since is null
        or a.running_since < now() - public.claim_stale_after()
      )
    for update skip locked
  )
  update public.automations a
     set status = 'running',
         running_since = now()
    from target
   where a.id = target.id
  returning a.*;
end;
$$;

-- The functions run as their definer (postgres) so the worker's service role
-- reaches them; the anon role must not be able to start runs by calling them
-- straight through PostgREST.
revoke all on function public.claim_due_automations(int) from public, anon, authenticated;
revoke all on function public.claim_automation(uuid)     from public, anon, authenticated;
grant execute on function public.claim_due_automations(int) to service_role;
grant execute on function public.claim_automation(uuid)     to service_role;
