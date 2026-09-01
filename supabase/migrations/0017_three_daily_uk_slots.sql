-- Three-post operating profile for the only active missions: Deadset and Cast.
-- Content is built before breakfast, then owner-approved posts are released at
-- 12:00, 16:00 and 20:00 Europe/London. The publish cron contains the GMT and
-- BST UTC candidates; the Worker performs the authoritative local-time gate.

alter table public.tiktok_accounts
  alter column daily_post_limit set default 3;

update public.tiktok_accounts
   set daily_post_limit = 3
 where app_id in (select id from public.apps where slug in ('deadset', 'cast'));

with ranked_accounts as (
  select id,
         app_id,
         row_number() over (
           partition by app_id
           order by case status when 'connected' then 0 else 1 end, created_at desc
         ) as rank
    from public.tiktok_accounts
   where app_id is not null
)
update public.automations a
   set cron = case p.slug
         when 'deadset' then '0 4 * * *'
         when 'cast' then '10 4 * * *'
         else a.cron
       end,
       config = jsonb_set(
         jsonb_set(coalesce(a.config, '{}'::jsonb), '{count}', '3'::jsonb, true),
         '{account_id}',
         to_jsonb(r.id::text),
         true
       ),
       enabled = true,
       status = case when a.status = 'running' then a.status else 'idle' end,
       failure_streak = 0,
       next_run_at = (
         date_trunc('day', now() at time zone 'Europe/London')
         + interval '1 day 5 hours'
         + case p.slug when 'cast' then interval '10 minutes' else interval '0 minutes' end
       ) at time zone 'Europe/London'
  from public.apps p
  join ranked_accounts r on r.app_id = p.id and r.rank = 1
 where a.app_id = p.id
   and a.handler_key = 'tiktok.generate'
   and p.slug in ('deadset', 'cast');

update public.automations a
   set config = jsonb_set(coalesce(a.config, '{}'::jsonb), '{max_per_run}', '3'::jsonb, true),
       enabled = true,
       status = case when a.status = 'running' then a.status else 'idle' end,
       failure_streak = 0,
       next_run_at = coalesce(a.next_run_at, now() + interval '5 minutes')
  from public.apps p
 where a.app_id = p.id
   and a.handler_key = 'tiktok.produce'
   and p.slug in ('deadset', 'cast');

update public.automations a
   set cron = '0 11,12,15,16,19,20 * * *',
       config = jsonb_build_object(
         'max_per_run', 3,
         'timezone', 'Europe/London',
         'local_hours', jsonb_build_array(12, 16, 20)
       ),
       enabled = true,
       status = case when a.status = 'running' then a.status else 'idle' end,
       failure_streak = 0,
       next_run_at = now() + interval '1 minute'
 where a.handler_key = 'tiktok.publish';

with ranked_accounts as (
  select id,
         app_id,
         row_number() over (
           partition by app_id
           order by case status when 'connected' then 0 else 1 end, created_at desc
         ) as rank
    from public.tiktok_accounts
   where app_id is not null
)
update public.artifacts artifact
   set account_id = target.id
  from ranked_accounts target
 where target.app_id = artifact.app_id
   and target.rank = 1
   and artifact.account_id is null
   and artifact.status in ('draft', 'approved');

-- LifeScore remains completely dormant until its release lock is deliberately
-- removed in a future migration.
update public.automations a
   set enabled = false,
       status = 'disabled',
       next_run_at = null
  from public.apps p
 where a.app_id = p.id
   and p.slug = 'lifescore';
