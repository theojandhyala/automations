-- Move both active TikTok missions to the owner's final three-post schedule:
-- 12:00, 15:00 and 18:00 Europe/London. The UTC cron includes both GMT and
-- BST candidates; tiktok.publish performs the authoritative local-time gate.

alter table public.tiktok_accounts
  alter column daily_post_limit set default 3;

update public.tiktok_accounts
   set daily_post_limit = 3
 where app_id in (select id from public.apps where slug in ('deadset', 'cast'));

update public.automations
   set cron = '0 11,12,14,15,17,18 * * *',
       config = jsonb_build_object(
         'max_per_run', 3,
         'timezone', 'Europe/London',
         'local_hours', jsonb_build_array(12, 15, 18)
       ),
       enabled = true,
       status = case when status = 'running' then status else 'idle' end,
       failure_streak = 0,
       next_run_at = now() + interval '1 minute'
 where handler_key = 'tiktok.publish';

-- Reassert brand/account ownership on every queued item. Anything without an
-- app-owned account remains unsendable and visible for repair in JARVIS.
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
   and artifact.status in ('draft', 'approved')
   and artifact.app_id in (select id from public.apps where slug in ('deadset', 'cast'));

-- LifeScore stays unable to generate, render or publish until its release lock
-- is deliberately removed by a future migration.
update public.automations a
   set enabled = false,
       status = 'disabled',
       next_run_at = null
  from public.apps p
 where a.app_id = p.id
   and p.slug = 'lifescore';
