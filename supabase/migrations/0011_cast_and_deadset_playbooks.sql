-- Promote only shipped products, and give Cast the same exact-screen carousel
-- production path as Deadset. Draft schedules stop at owner review.

alter table public.apps
  add column promotion_enabled boolean not null default true;

update public.apps
   set promotion_enabled = false
 where slug = 'lifescore';

update public.apps
   set tagline = case slug
     when 'deadset' then 'Plan. Log. Progress.'
     when 'cast' then 'Read the water. Prove what is there. Fish it together.'
     else tagline
   end
 where slug in ('deadset', 'cast');

alter table public.promotion_missions
  drop constraint promotion_mission_audience;

alter table public.promotion_missions
  add constraint promotion_mission_audience check (
    audience in (
      'new_lifters', 'consistent_lifters', 'serious_gym', 'general_fitness',
      'new_anglers', 'weekend_anglers', 'serious_anglers', 'local_crews'
    )
  );

update public.automations a
   set name = 'Draft native carousels — Cast',
       description = 'Drafts original fishing hooks paired with exact Cast feature proof under the verified Cast playbook.',
       cron = '10 18 * * 2,4,6',
       enabled = true,
       status = 'idle',
       failure_streak = 0,
       next_run_at = now() + interval '10 minutes',
       config = jsonb_build_object(
         'app_slug', 'cast',
         'count', 2,
         'content_format', 'photo_carousel',
         'source_policy', 'licensed_real_only',
         'feature_rotation', jsonb_build_array(
           'bite_forecast',
           'fishkey',
           'catch_map',
           'catch_log',
           'records',
           'crew'
         )
       )
  from public.apps p
 where a.app_id = p.id
   and p.slug = 'cast'
   and a.handler_key = 'tiktok.generate';

update public.automations a
   set enabled = true,
       status = 'idle',
       failure_streak = 0,
       next_run_at = coalesce(a.next_run_at, now() + interval '5 minutes')
  from public.apps p
 where a.app_id = p.id
   and p.slug = 'deadset'
   and a.handler_key = 'tiktok.generate';

update public.automations a
   set enabled = false,
       status = 'disabled',
       next_run_at = null,
       description = 'Paused until LifeScore is released and its product truth is verified.'
  from public.apps p
 where a.app_id = p.id
   and p.slug = 'lifescore'
   and a.handler_key = 'tiktok.generate';

insert into public.automations (
  handler_key, name, description, app_id, cron, enabled, config,
  icon, accent, kind, orbit_ring, next_run_at
)
select
  'tiktok.produce',
  'Build Cast carousels',
  'Pairs licensed fishing imagery with exact owner-uploaded Cast feature screens, renders 9:16 slides and stops at review.',
  p.id,
  '*/15 * * * *',
  true,
  jsonb_build_object('app_slug', 'cast', 'max_per_run', 2),
  'sparkles',
  p.accent,
  'app',
  2,
  now() + interval '15 minutes'
from public.apps p
where p.slug = 'cast'
  and not exists (
    select 1 from public.automations a
     where a.handler_key = 'tiktok.produce' and a.app_id = p.id
  );

update public.automations
   set description = 'Pairs licensed real imagery with exact app screens, renders 9:16 slides and stops at owner review.'
 where handler_key = 'tiktok.produce';
