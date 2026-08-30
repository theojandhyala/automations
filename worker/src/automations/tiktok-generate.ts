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
  feature?: string;
  slides?: Array<{
    role: 'hook' | 'feature_proof';
    overlay: string;
    asset_query?: string;
    app_asset_key?: string;
    source_requirement?: string;
  }>;
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

const DEADSET_PHOTO_SYSTEM = `You create original two-slide TikTok photo carousel drafts for DEADSET,
a gym planning and workout tracking app.

The content grammar is:
1. Slide one is a candid, believable real-life gym or lifestyle photograph with one short relatable
   question or setup in native TikTok text.
2. Slide two is an exact screenshot or export of one real DEADSET feature that answers the setup.

Feature truth — use only these exact capabilities:
- muscle_diagram: the exercise library highlights primary and secondary target muscles. It is not a
  body-transformation or strength-progress comparison.
- training_heatmap: logged sessions build a visual consistency/volume heatmap.
- pr_wall: logged personal records appear together as a PR wall.
- progression_board: logged training history helps show what load to use next.
- workout_plan: users build or follow a structured weekly workout plan.
- live_logger: users record sets, reps and weights during a workout.

Creative rules:
- The hook must read like an entertaining gym thought, text message, confession or question — never
  like an ad headline. Keep it under 70 characters and understandable in one second.
- Use a real licensed stock photo or creator-owned photo. Never request an AI person, a celebrity,
  a copied social post, or an image downloaded from Pinterest. Pinterest may guide the mood only.
- Ask for ordinary phone-camera situations: mirror photo, walking to the gym, resting between sets,
  packing a bag, looking at the cable stack, or leaving after a session.
- The payoff must name an exact current DEADSET asset key. Never fabricate app UI, statistics,
  testimonials, strength gains, streaks, PRs, or body transformations.
- No logo card, App Store badge, watermark or promotional copy burned into the images. The product
  should appear because it completes the joke or proves the point.
- Caption: one natural sentence, then "deadset on appstore". Use 3-5 relevant lowercase hashtags.
- Every idea must use a different hook situation and a different feature.

Reply with JSON only:
{"ideas":[{
  "hook":"...",
  "caption":"... deadset on appstore",
  "hashtags":["gymtok","workouttracker","deadset"],
  "shot_notes":"two 1080x1920 stills; native bold white text with black outline; exact app capture",
  "feature":"one feature key from the list",
  "slides":[
    {"role":"hook","overlay":"...","asset_query":"...","source_requirement":"licensed real photo; record source and licence"},
    {"role":"feature_proof","overlay":"...","app_asset_key":"...","source_requirement":"exact current DEADSET screenshot; no rebuilt UI"}
  ]
}]}`;

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
      content_format?: 'video' | 'photo_carousel';
      source_policy?: 'licensed_real_only';
      feature_rotation?: string[];
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

    const isDeadsetCarousel = app.slug === 'deadset' && config.content_format === 'photo_carousel';
    const { ideas } = await completeJson<{ ideas: DraftIdea[] }>(ctx.env, {
      system: isDeadsetCarousel ? DEADSET_PHOTO_SYSTEM : SYSTEM,
      maxTokens: isDeadsetCarousel ? 2800 : undefined,
      prompt: [
        `App: ${app.name}`,
        app.tagline ? `Tagline: ${app.tagline}` : null,
        isDeadsetCarousel
          ? `Allowed feature rotation: ${(config.feature_rotation ?? []).join(', ') || 'use the feature list above'}`
          : null,
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

    const rows = ideas.slice(0, count).map((idea) => {
      const rawSlides = Array.isArray(idea.slides) ? idea.slides.slice(0, 2) : [];
      const slides = isDeadsetCarousel
        ? [
            {
              role: 'hook' as const,
              overlay: rawSlides[0]?.overlay ?? idea.hook,
              asset_query: rawSlides[0]?.asset_query ?? idea.shot_notes,
              source_requirement:
                rawSlides[0]?.source_requirement ?? 'licensed real photo; record original source and licence',
            },
            {
              role: 'feature_proof' as const,
              overlay: rawSlides[1]?.overlay ?? 'the work, made visible',
              app_asset_key: rawSlides[1]?.app_asset_key ?? idea.feature ?? 'live_logger',
              source_requirement:
                rawSlides[1]?.source_requirement ?? 'exact current DEADSET screenshot; no rebuilt UI',
            },
          ]
        : [];
      return {
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
        media_type: isDeadsetCarousel ? 'photo' : 'video',
        asset_manifest: isDeadsetCarousel
          ? {
              version: 1,
              format: 'two_slide_photo_carousel',
              style: 'native_real_photo_to_feature_proof',
              feature: idea.feature ?? slides[1]?.app_asset_key ?? null,
              slides,
              source_policy: 'licensed_real_only',
              licence_note:
                'Pinterest is reference-only. Use creator-owned or explicitly licensed stock and record the original source.',
              generated_people: false,
              fabricated_ui: false,
            }
          : {},
        // Deadset promotes the owner's own app. The user still confirms this
        // disclosure in the review screen before approval.
        brand_organic_toggle: false,
        brand_content_toggle: false,
        is_aigc: false,
      };
    });

    await ctx.db.insertMany('artifacts', rows);
    for (const idea of ideas.slice(0, count)) {
      ctx.log('info', `drafted: ${idea.hook}`, { shot_notes: idea.shot_notes });
    }

    return { app: app.slug, drafted: rows.length };
  },
};
