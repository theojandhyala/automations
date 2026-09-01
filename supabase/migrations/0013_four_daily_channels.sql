-- Paid-capacity operating profile: four owner-approved posts per connected
-- account each day. Generation and rendering remain batched; publishing is
-- staggered so content never lands as a burst.

alter table public.tiktok_accounts
  alter column daily_post_limit set default 4;

update public.tiktok_accounts
   set daily_post_limit = 4
 where daily_post_limit < 4;

update public.automations a
   set cron = case p.slug
         when 'deadset' then '0 7 * * *'
         when 'cast' then '10 7 * * *'
         else a.cron
       end,
       config = jsonb_set(coalesce(a.config, '{}'::jsonb), '{count}', '4'::jsonb, true),
       next_run_at = now() + case p.slug
         when 'deadset' then interval '10 minutes'
         when 'cast' then interval '20 minutes'
         else interval '30 minutes'
       end
  from public.apps p
 where a.app_id = p.id
   and a.handler_key = 'tiktok.generate'
   and p.slug in ('deadset', 'cast');

update public.automations a
   set config = jsonb_set(coalesce(a.config, '{}'::jsonb), '{max_per_run}', '4'::jsonb, true),
       next_run_at = coalesce(a.next_run_at, now() + interval '15 minutes')
  from public.apps p
 where a.app_id = p.id
   and a.handler_key = 'tiktok.produce'
   and p.slug in ('deadset', 'cast');

update public.automations
   set cron = '0 11,15,19,22 * * *',
       config = jsonb_set(coalesce(config, '{}'::jsonb), '{max_per_run}', '5'::jsonb, true),
       enabled = true,
       status = 'idle',
       failure_streak = 0,
       next_run_at = now() + interval '30 minutes'
 where handler_key = 'tiktok.publish';
