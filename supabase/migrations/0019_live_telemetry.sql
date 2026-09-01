-- Live JARVIS telemetry: publish every owner-visible operating table to
-- Supabase Realtime so the dashboard reacts as soon as a run, artifact,
-- account, mission or analytics row changes. Sensitive integration secrets
-- are deliberately excluded from the publication.

do $$
declare
  live_table text;
begin
  foreach live_table in array array[
    'apps',
    'automations',
    'runs',
    'run_events',
    'artifacts',
    'tiktok_accounts',
    'analytics_snapshots',
    'post_metrics',
    'daily_reports',
    'promotion_missions',
    'creative_assets',
    'apple_offer_code_requests'
  ]
  loop
    if not exists (
      select 1
        from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = live_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', live_table);
    end if;
  end loop;
end
$$;

-- Engagement collection stays armed even before TikTok approval. Missing
-- scopes produce an honest partial snapshot; the same node begins returning
-- full views, likes, comments and shares automatically after approval.
update public.automations
   set cron = '3,13,23,33,43,53 * * * *',
       config = jsonb_build_object('lookback_posts', 20),
       enabled = true,
       status = case when status = 'running' then status else 'idle' end,
       failure_streak = 0,
       next_run_at = now() + interval '1 minute',
       description = 'Refreshes account and per-post views, likes, comments and shares every ten minutes; records partial state until TikTok grants the required scopes.'
 where handler_key = 'analytics.sync';
