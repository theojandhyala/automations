import { completeJson } from '../lib/claude';
import type { Handler } from './registry';

interface App {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  app_store_url: string | null;
}

interface DraftIdea {
  hook: string;
  caption: string;
  hashtags: string[];
  shot_notes: string;
}

const SYSTEM = `You write short-form vertical video concepts for a solo app developer
promoting their own apps on TikTok.

Rules:
- The hook is the first 2 seconds of on-screen text. Concrete and specific; no
  "POV:" cliches, no fake urgency, no invented statistics or user counts.
- The caption is one or two sentences in a plain, human voice.
- Never claim features the app description does not mention.
- 3-5 hashtags, lowercase, no banned or engagement-bait tags.
- Each idea must be genuinely distinct from the others, not a reword.

Reply with JSON only: {"ideas":[{"hook","caption","hashtags":[],"shot_notes"}]}`;

/**
 * Drafts video concepts for one app and stages them as artifacts in 'draft'.
 * Nothing here touches TikTok -- drafts sit in the review queue until they are
 * approved in the dashboard, which is what the publish automation picks up.
 *
 * config: { app_slug: string, count?: number, account_id?: string, extra_context?: string }
 */
export const generateDrafts: Handler = {
  key: 'tiktok.generate',
  name: 'Draft TikTok concepts',
  description: 'Writes hooks, captions and shot notes for one app and stages them for review.',
  async run(ctx) {
    const config = ctx.automation.config as {
      app_slug?: string;
      count?: number;
      account_id?: string;
      extra_context?: string;
    };

    const appSlug = config.app_slug;
    if (!appSlug) throw new Error('config.app_slug is required');
    const count = Math.min(Math.max(config.count ?? 3, 1), 10);

    const app = await ctx.db.selectOne<App>('apps', `slug=eq.${appSlug}&select=*`);
    if (!app) throw new Error(`no app with slug "${appSlug}"`);

    // Avoid re-treading recent angles: show the model what already exists.
    const recent = await ctx.db.select<{ hook: string | null }>(
      'artifacts',
      `app_id=eq.${app.id}&select=hook&order=created_at.desc&limit=25`,
    );
    const recentHooks = recent.map((r) => r.hook).filter(Boolean);

    ctx.log('info', `drafting ${count} concepts for ${app.name}`, { recent: recentHooks.length });

    const { ideas } = await completeJson<{ ideas: DraftIdea[] }>(ctx.env, {
      system: SYSTEM,
      prompt: [
        `App: ${app.name}`,
        app.tagline ? `Tagline: ${app.tagline}` : null,
        config.extra_context ? `Context: ${config.extra_context}` : null,
        recentHooks.length ? `Already used, do not repeat:\n- ${recentHooks.join('\n- ')}` : null,
        `Write ${count} new ideas.`,
      ]
        .filter(Boolean)
        .join('\n'),
    });

    if (!Array.isArray(ideas) || ideas.length === 0) throw new Error('model returned no ideas');

    const rows = ideas.slice(0, count).map((idea) => ({
      run_id: ctx.runId,
      app_id: app.id,
      account_id: config.account_id ?? null,
      status: 'draft',
      hook: idea.hook,
      caption: idea.caption,
      hashtags: Array.isArray(idea.hashtags) ? idea.hashtags.slice(0, 5) : [],
    }));

    await ctx.db.insertMany('artifacts', rows);
    for (const idea of ideas.slice(0, count)) {
      ctx.log('info', `drafted: ${idea.hook}`, { shot_notes: idea.shot_notes });
    }

    return { app: app.slug, drafted: rows.length };
  },
};
