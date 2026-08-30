import type { Handler } from './registry';

/**
 * Does nothing except prove the control plane is alive: cron fires, a run is
 * recorded, logs land. Useful as the first thing to enable on a fresh deploy.
 */
export const heartbeat: Handler = {
  key: 'system.heartbeat',
  name: 'Heartbeat',
  description: 'Records a run on a schedule so you can confirm the dispatcher is healthy.',
  async run(ctx) {
    ctx.log('info', 'control plane is alive');
    return { at: new Date().toISOString() };
  },
};
