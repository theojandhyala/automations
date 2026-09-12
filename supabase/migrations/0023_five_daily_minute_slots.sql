-- Owner cadence: five daily posts per brand, Europe/London (DST aware).
-- Deploy the minute-aware Worker before commissioning this migration.
begin;

create or replace function public.tiktok_slot_at(p_at timestamptz)
returns text language sql stable as $$
  select key from (values ('10',600),('12',720),('14',840),('16',960),('18:30',1110)) as slots(key,minute_of_day)
  where extract(hour from p_at at time zone 'Europe/London') * 60
      + extract(minute from p_at at time zone 'Europe/London') >= minute_of_day
    and extract(hour from p_at at time zone 'Europe/London') * 60
      + extract(minute from p_at at time zone 'Europe/London') < minute_of_day + 5
  limit 1;
$$;
revoke all on function public.tiktok_slot_at(timestamptz) from public, anon, authenticated;
grant execute on function public.tiktok_slot_at(timestamptz) to service_role;

-- Preserve the live transaction's routing, exact-row comparison, account lock,
-- reservations and uncertain-attempt handling. Only slot matching and cap change.
do $$
declare definition text; changed text;
begin
  definition := pg_get_functiondef('public.reserve_tiktok_delivery(uuid,boolean,jsonb)'::regprocedure);
  if position('public.tiktok_slot_at(now())' in definition) = 0 then
    if position('least(account.daily_post_limit,4)' in definition) = 0
       or position('not in (12,15,18,21)' in definition) = 0 then
      raise exception 'Unexpected delivery function; inspect before migration';
    end if;
    changed := regexp_replace(definition,
      $pattern$if extract\(hour from local_now\) not in \(12,15,18,21\)\s+or extract\(minute from local_now\) >= 5\s+then return false; end if;\s+slot_name := to_char\(local_now, 'HH24'\);$pattern$,
      'slot_name := public.tiktok_slot_at(now()); if slot_name is null then return false; end if;');
    if changed = definition then raise exception 'Slot replacement did not match'; end if;
    changed := replace(changed,'least(account.daily_post_limit,4)','least(account.daily_post_limit,5)');
    execute changed;
  elsif position('least(account.daily_post_limit,5)' in definition) = 0 then
    raise exception 'Unexpected cap in migrated delivery function';
  end if;
end $$;

-- One atomic, authenticated-server-only commissioning action. No content or
-- consent is changed, and LifeScore remains release-locked.
create or replace function public.configure_five_daily_posting()
returns jsonb language plpgsql as $$
declare target_count integer;
begin
  select count(*) into target_count from public.tiktok_accounts a join public.apps p on p.id=a.app_id
  where p.promotion_enabled and a.status='connected'
    and ((p.slug='deadset' and lower(trim(leading '@' from a.handle))='deadset.app')
      or (p.slug='cast' and lower(trim(leading '@' from a.handle))='cast.fishing.app'));
  if target_count <> 2 then raise exception 'Both matching connected brand accounts are required'; end if;
  if (select count(*) from public.automations where handler_key='tiktok.publish' and enabled) <> 1
    or (select count(*) from public.automations where handler_key='tiktok.generate' and config->>'app_slug' in ('deadset','cast') and enabled) <> 2
    or (select count(*) from public.automations where handler_key='tiktok.produce' and config->>'app_slug' in ('deadset','cast') and enabled) <> 2
  then raise exception 'One enabled publisher and both drafting/production missions are required'; end if;
  update public.automations
  set config = (config - 'local_hours') || '{"timezone":"Europe/London","local_times":["10:00","12:00","14:00","16:00","18:30"]}'::jsonb,
      cron='* * * * *'
  where handler_key='tiktok.publish';
  update public.automations set config = config || '{"count":5}'::jsonb
  where handler_key='tiktok.generate' and config->>'app_slug' in ('deadset','cast');
  update public.tiktok_accounts a set daily_post_limit=5 from public.apps p
  where a.app_id=p.id and p.promotion_enabled and a.status='connected'
    and ((p.slug='deadset' and lower(trim(leading '@' from a.handle))='deadset.app')
      or (p.slug='cast' and lower(trim(leading '@' from a.handle))='cast.fishing.app'));
  return jsonb_build_object('timezone','Europe/London','local_times',jsonb_build_array('10:00','12:00','14:00','16:00','18:30'),
    'daily_post_limit',5,'note','Five daily slots saved for both accounts. Only reviewed, approved posts can publish.');
end $$;
revoke all on function public.configure_five_daily_posting() from public, anon, authenticated;
grant execute on function public.configure_five_daily_posting() to service_role;
update public.automations set config = config || jsonb_build_object('editorial_plan',
  case config->>'app_slug' when 'deadset' then
    '{"timezone":"Europe/London","daily_target":5,"formats":["relatable_product_answer","habit_tier_list","mistake_fix","shipped_feature_tutorial","occasional_ten_slide_rules"],"authored_imports":["habit_tier_list","ten_slide_rules"],"long_post_max_per_day":1,"calendar_lane":"hold_until_public_release","branding":"Exact official Deadset lockup and red/black app branding on authored promotion slides; genuine product UI; readable App Store CTA","audio":"TikTok recommended music for cloud photo delivery; no named-track guarantee"}'::jsonb
  else
    '{"timezone":"Europe/London","daily_target":5,"formats":["field_checklist","useful_habits_ranked","mistake_fix","comparison","session_story"],"slides":6,"distinct_photos":6,"final_slide":"Truthful Cast benefit plus App Store CTA on every post","audio":"TikTok recommended music; do not manually select Travel by Trees and Lucy"}'::jsonb end)
where handler_key='tiktok.generate' and config->>'app_slug' in ('deadset','cast');
select public.configure_five_daily_posting();
commit;
