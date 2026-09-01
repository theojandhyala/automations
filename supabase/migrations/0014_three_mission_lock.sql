-- JARVIS has one purpose: promote Deadset, Cast and LifeScore after release.
-- Retire unrelated scheduled jobs and keep the necessary posting machinery
-- internal to those three product missions.

update public.automations
   set enabled = false,
       status = 'disabled',
       next_run_at = null,
       current_task = null,
       failure_streak = 0
 where handler_key in ('system.heartbeat', 'report.daily', 'pipeline.audit');

-- Analytics is useful to creative learning, but it cannot run until the
-- production TikTok scopes exist. Keeping it dormant prevents pointless API
-- calls while the app remains in sandbox review.
update public.automations
   set enabled = false,
       status = 'disabled',
       next_run_at = null,
       current_task = null,
       failure_streak = 0
 where handler_key = 'analytics.sync';

update public.automations a
   set enabled = true,
       status = case when a.status = 'running' then a.status else 'idle' end,
       failure_streak = 0,
       next_run_at = coalesce(a.next_run_at, now() + case p.slug
         when 'deadset' then interval '10 minutes'
         else interval '20 minutes'
       end)
  from public.apps p
 where a.app_id = p.id
   and p.slug in ('deadset', 'cast')
   and a.handler_key in ('tiktok.generate', 'tiktok.produce');

update public.automations a
   set enabled = false,
       status = 'disabled',
       next_run_at = null,
       current_task = null,
       failure_streak = 0,
       description = 'Release lock engaged. This mission cannot spend resources until LifeScore ships.'
  from public.apps p
 where a.app_id = p.id
   and p.slug = 'lifescore';

update public.automations
   set enabled = true,
       status = case when status = 'running' then status else 'idle' end,
       failure_streak = 0,
       next_run_at = coalesce(next_run_at, now() + interval '30 minutes')
 where handler_key = 'tiktok.publish';

update public.automations
   set enabled = true,
       status = case when status = 'running' then status else 'idle' end,
       failure_streak = 0,
       next_run_at = coalesce(next_run_at, now() + interval '10 minutes')
 where handler_key = 'tiktok.reconcile';

update public.apps set promotion_enabled = true where slug in ('deadset', 'cast');
update public.apps set promotion_enabled = false where slug = 'lifescore';
