import type { Db } from './db';

/** Owner's three-post cadence; account caps remain enforced by atomic DB reservation. */
export async function applyThreeDaily(db: Pick<Db, 'select' | 'update'>) {
  const apps = await db.select<{ id: string; slug: string }>('apps', 'slug=in.(deadset,cast)&promotion_enabled=eq.true&select=id,slug');
  if (apps.length !== 2) throw new Error('Both active brand missions are required. No settings changed.');
  const accounts = await db.select<{ id: string; app_id: string; handle: string }>('tiktok_accounts',
    `app_id=in.(${apps.map(a => a.id).join(',')})&status=eq.connected&select=id,app_id,handle`);
  const targets = apps.map(app => accounts.filter(a => a.app_id === app.id && a.handle.trim().replace(/^@/, '').toLowerCase() === (app.slug === 'deadset' ? 'deadset.app' : 'cast.fishing.app')));
  if (targets.some(a => a.length !== 1)) throw new Error('One matching connected account per brand is required. No settings changed.');
  const automations = await db.select<{ id: string; handler_key: string; config: Record<string, unknown> }>('automations',
    'handler_key=in.(tiktok.publish,tiktok.generate)&select=id,handler_key,config');
  if (!automations.some(a => a.handler_key === 'tiktok.publish')) throw new Error('Publisher configuration is missing. No settings changed.');
  // Reduce the cap first. A partial failure stays conservative and can be retried;
  // no content, reservation, review, enablement, routing or token is changed.
  for (const [a] of targets) {
    const rows = await db.update('tiktok_accounts', `id=eq.${a!.id}&app_id=eq.${a!.app_id}&status=eq.connected&handle=eq.${encodeURIComponent(a!.handle)}`, { daily_post_limit: 3 });
    if (rows.length !== 1) throw new Error('Account changed while saving the cadence. Reload and retry.');
  }
  for (const a of automations) {
    const publish = a.handler_key === 'tiktok.publish';
    if (!publish && !['deadset', 'cast'].includes(String(a.config.app_slug))) continue;
    const rows = await db.update('automations', `id=eq.${a.id}&config=eq.${encodeURIComponent(JSON.stringify(a.config))}`, { config: { ...a.config, ...(publish ? { timezone: 'Europe/London', local_hours: [12, 15, 18] } : { count: 3 }) } });
    if (rows.length !== 1) throw new Error('Automation changed while saving the cadence. Reload and retry.');
  }
  return { accounts: targets.map(([a]) => ({ id: a!.id, handle: a!.handle, daily_post_limit: 3 })), timezone: 'Europe/London', local_hours: [12, 15, 18], note: 'Three daily slots saved. Only reviewed, approved posts can publish.' };
}
