-- Owner requested four posts per active account. Keep enablement, approvals,
-- routing, uncertainty locks and existing reservations unchanged.
begin;

do $$
declare definition text;
begin
  definition := pg_get_functiondef('public.reserve_tiktok_delivery(uuid,boolean,jsonb)'::regprocedure);
  if position('not in (12,15,18)' in definition) = 0
     or position('least(account.daily_post_limit,3)' in definition) = 0 then
    raise exception 'Unexpected delivery function; inspect before changing schedule';
  end if;
  definition := replace(definition, 'not in (12,15,18)', 'not in (12,15,18,21)');
  definition := replace(definition, 'least(account.daily_post_limit,3)', 'least(account.daily_post_limit,4)');
  execute definition;
end $$;

update public.tiktok_accounts a set daily_post_limit = 4
from public.apps p
where a.app_id = p.id and p.promotion_enabled
  and ((p.slug = 'deadset' and lower(trim(leading '@' from a.handle)) = 'deadset.app')
    or (p.slug = 'cast' and lower(trim(leading '@' from a.handle)) = 'cast.fishing.app'));

update public.automations
set config = config || '{"timezone":"Europe/London","local_hours":[12,15,18,21]}'::jsonb
where handler_key = 'tiktok.publish';

update public.automations set config = config || '{"count":4}'::jsonb
where handler_key = 'tiktok.generate' and config->>'app_slug' in ('deadset','cast');

commit;
