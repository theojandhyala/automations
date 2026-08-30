import { completeJson } from '../lib/ai';
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

// Four manual/scheduled runs per brand per UTC day is far above the normal
// twice-weekly schedule but prevents a stuck client from burning through the
// shared Workers AI free allocation.
const MAX_DAILY_RUNS_PER_APP = 4;

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

    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const todayRuns = await ctx.db.select<{ id: string }>(
      'runs',
      `automation_id=eq.${ctx.automation.id}&started_at=gte.${dayStart.toISOString()}&select=id&limit=${MAX_DAILY_RUNS_PER_APP + 1}`,
    );
    // The current run row already exists by the time the handler starts.
    if (todayRuns.length > MAX_DAILY_RUNS_PER_APP) {
      throw new Error(`daily free-AI run limit reached for ${app.name}`);
    }

    // Avoid re-treading recent angles: show the model what already exists.
    const recent = await ctx.db.select<{ hook: string | null }>(
      'artifacts',
      `app_id=eq.${app.id}&select=hook&order=created_at.desc&limit=25`,
    );
    const recentHooks = recent.map((r) => r.hook).filter(Boolean);

    await ctx.setTask(`drafting ${count} concepts for ${app.name}`);
    ctx.log('debug', 'seeded with recent hooks', { recent: recentHooks.length });

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

    // The concept stage is genuinely done; everything between it and review is
    // not built yet, and the artifact records that rather than leaving the
    // dashboard to imply a video exists.
    const now = new Date().toISOString();
    const stages = {
      research: { state: 'not_configured', note: 'No research handler yet' },
      concept: { state: 'done', at: now },
      script: { state: 'not_configured', note: 'No scripting handler yet' },
      assets: { state: 'not_configured', note: 'Footage must be supplied by hand' },
      edit: { state: 'not_configured', note: 'No render handler yet' },
      review: { state: 'pending' },
    };

    const rows = ideas.slice(0, count).map((idea) => ({
      run_id: ctx.runId,
      app_id: app.id,
      account_id: config.account_id ?? null,
      status: 'draft',
      stage: 'concept',
      stages,
      hook: idea.hook,
      caption: idea.caption,
      // Persisted, not just logged: these are the filming and editing
      // instructions, and the review queue is where they are actually needed.
      shot_notes: idea.shot_notes ?? null,
      hashtags: Array.isArray(idea.hashtags) ? idea.hashtags.slice(0, 5) : [],
    }));

    await ctx.db.insertMany('artifacts', rows);
    for (const idea of ideas.slice(0, count)) {
      ctx.log('info', `drafted: ${idea.hook}`, { shot_notes: idea.shot_notes });
    }

    return { app: app.slug, drafted: rows.length };
  },
};
