-- Nine agents around the core: three per-app drafting agents plus six system
-- agents that serve all the workspaces. Everything stays disabled until it is
-- deliberately switched on from the command center.

-- Give the existing per-app drafting automations their agent identity.
update public.automations a
   set kind = 'app',
       icon = 'pen',
       accent = p.accent,
       orbit_ring = 1,
       orbit_position = case p.slug
         when 'deadset'   then 0.0000
         when 'cast'      then 0.1111
         when 'lifescore' then 0.2222
       end
  from public.apps p
 where a.app_id = p.id
   and a.handler_key = 'tiktok.generate';

update public.automations set icon = 'upload', accent = '#2fd4a0',
       orbit_ring = 1, orbit_position = 0.3333
 where handler_key = 'tiktok.publish';

update public.automations set icon = 'sync', accent = '#6ea8fe',
       orbit_ring = 1, orbit_position = 0.4444
 where handler_key = 'tiktok.reconcile';

update public.automations set icon = 'heart', accent = '#8b95a5',
       orbit_ring = 2, orbit_position = 0.8889
 where handler_key = 'system.heartbeat';

-- New system agents.
insert into public.automations
  (handler_key, name, description, cron, enabled, config, icon, accent, kind, orbit_ring, orbit_position)
values
  (
    'analytics.sync',
    'Analytics sync',
    'Pulls follower, view and per-post metrics for every connected account.',
    '0 */4 * * *',
    false,
    '{}'::jsonb,
    'chart', '#fbbf24', 'system', 1, 0.5556
  ),
  (
    'report.daily',
    'Morning report',
    'Builds the 08:00 report: what ran, what shipped, what needs a decision.',
    '0 8 * * *',
    false,
    '{"timezone_note": "cron is UTC; shift this to match your local 08:00"}'::jsonb,
    'sun', '#f0724a', 'system', 1, 0.6667
  ),
  (
    'pipeline.audit',
    'Pipeline audit',
    'Flags stuck artifacts, expiring tokens and stages that are still unconfigured.',
    '0 7 * * *',
    false,
    '{"stuck_after_hours": 48}'::jsonb,
    'shield', '#7c5cff', 'system', 1, 0.7778
  );
