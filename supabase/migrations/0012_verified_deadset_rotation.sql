-- Keep scheduled Deadset carousels on feature screens that are verified and
-- already loaded. Heatmap and PR wall return to the rotation after exact
-- product captures are uploaded by the owner.

update public.automations a
   set config = jsonb_set(
         coalesce(a.config, '{}'::jsonb),
         '{feature_rotation}',
         jsonb_build_array(
           'muscle_diagram',
           'progression_board',
           'workout_plan',
           'live_logger'
         ),
         true
       )
  from public.apps p
 where a.app_id = p.id
   and p.slug = 'deadset'
   and a.handler_key = 'tiktok.generate';
