-- Starter automations. All disabled: enable them from the dashboard once the
-- TikTok accounts are connected and you have looked at what the drafting
-- automation actually produces.

insert into public.automations (handler_key, name, description, app_id, cron, enabled, config)
select
  'tiktok.generate',
  'Draft concepts — ' || a.name,
  'Writes hooks, captions and shot notes for ' || a.name || ' into the review queue.',
  a.id,
  -- staggered so the three apps do not all call the model in the same minute
  case a.slug
    when 'deadset'   then '0 13 * * 1,4'
    when 'cast'      then '10 13 * * 1,4'
    when 'lifescore' then '20 13 * * 1,4'
  end,
  false,
  jsonb_build_object('app_slug', a.slug, 'count', 3)
from public.apps a;

insert into public.automations (handler_key, name, description, cron, enabled, config) values
  (
    'tiktok.publish',
    'Publish approved videos',
    'Sends approved artifacts to TikTok, one per account per pass, within each account''s daily limit.',
    '0 15,20 * * *',
    false,
    '{"max_per_run": 3}'::jsonb
  ),
  (
    'tiktok.reconcile',
    'Reconcile in-flight posts',
    'Polls TikTok for submitted videos and settles them as published or failed.',
    '*/10 * * * *',
    false,
    '{}'::jsonb
  ),
  (
    'system.heartbeat',
    'Heartbeat',
    'Proves the dispatcher is alive. Enable this first on a fresh deploy.',
    '*/15 * * * *',
    false,
    '{}'::jsonb
  );
