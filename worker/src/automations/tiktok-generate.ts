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
  audience?: string;
  single_promise?: string;
  hook_hypothesis?: string;
  proof_shown?: string;
  script?: string;
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

const SYSTEM = `You write original, shoot-ready short-form vertical video concepts for a solo app developer
promoting their own apps on TikTok.

Rules:
- The hook is the first second of on-screen text. Concrete and specific; no
  "POV:" cliches, no fake urgency, no invented statistics or user counts.
- One video makes one promise to one audience. The app reveal must prove the hook using a genuine
  relevant app capability, not a generic dashboard.
- Motion begins immediately. A real performance, workout action, hands, first-person demonstration,
  screen recording, voice or room sound carries the video. Never disguise a still montage as UGC.
- Write a 12-20 second timestamped beat sheet in the script field. Each beat must state the footage,
  spoken line, screen action, on-screen caption, sound and purpose. Change the visual or information
  beat every 1-3 seconds and avoid a static logo ending.
- The caption is one or two sentences in a plain, human voice.
- Never claim features the app description does not mention.
- No fabricated body transformations, testimonials, results, users or statistics.
- Real creator-owned or properly licensed footage only. Generated people cannot be customers.
- 3-5 hashtags, lowercase, no banned or engagement-bait tags.
- Each idea must be genuinely distinct from the others, not a reword.

Reply with JSON only: {"ideas":[{
  "hook":"...","caption":"...","hashtags":[],"shot_notes":"...",
  "audience":"...","single_promise":"...","hook_hypothesis":"...","proof_shown":"...",
  "script":"0:00-0:01 | footage: ... | spoken: ... | screen: ... | caption: ... | sound: ... | purpose: ...\\n..."
}]}`;

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
- Each carousel makes one promise to one audience, and the exact DEADSET screen is the proof.
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
  "audience":"...",
  "single_promise":"...",
  "hook_hypothesis":"...",
  "proof_shown":"exact DEADSET feature that resolves the hook",
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
      creative_brief?: {
        goal: string;
        audience: string;
        angle: string;
        hypothesis: string;
      };
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
      maxTokens: isDeadsetCarousel ? 2800 : 2600,
      prompt: [
        `App: ${app.name}`,
        app.tagline ? `Tagline: ${app.tagline}` : null,
        isDeadsetCarousel
          ? `Allowed feature rotation: ${(config.feature_rotation ?? []).join(', ') || 'use the feature list above'}`
          : null,
        config.extra_context ? `Context: ${config.extra_context}` : null,
        config.creative_brief ? `Creative brief: ${JSON.stringify(config.creative_brief)}` : null,
        recentHooks.length ? `Already used, do not repeat:\n- ${recentHooks.join('\n- ')}` : null,
        `Write ${count} new ideas.`,
      ]
        .filter(Boolean)
        .join('\n'),
    });

    if (!Array.isArray(ideas) || ideas.length === 0) throw new Error('model returned no ideas');

    const now = new Date().toISOString();

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
      const feature = idea.feature ?? slides[1]?.app_asset_key ?? null;
      const creativeBrief = {
        goal: config.creative_brief?.goal ?? null,
        audience: idea.audience ?? config.creative_brief?.audience ?? null,
        angle: config.creative_brief?.angle ?? null,
        single_promise: idea.single_promise ?? null,
        hook_hypothesis: idea.hook_hypothesis ?? config.creative_brief?.hypothesis ?? null,
        proof_shown: idea.proof_shown ?? feature,
        footage_provenance: isDeadsetCarousel
          ? 'creator-owned or explicitly licensed still; source and licence must be recorded'
          : 'creator-owned or explicitly licensed real footage; generated people may not represent customers',
        generated_people: false,
      };
      const stages = {
        research: {
          state: 'not_configured',
          note: 'No live trend-research handler is connected; the concept uses the saved native-TikTok playbook.',
        },
        concept: { state: 'done', at: now },
        script: isDeadsetCarousel
          ? { state: 'done', at: now, note: 'Two-slide hook and exact product-proof sequence is specified.' }
          : idea.script
            ? { state: 'done', at: now, note: 'Timestamped shoot-ready beat sheet is attached.' }
            : { state: 'not_configured', note: 'The model did not return a complete timestamped beat sheet.' },
        assets: {
          state: 'not_configured',
          note: isDeadsetCarousel
            ? 'The producer must attach a licensed real photo and exact current DEADSET capture.'
            : 'Record or attach the real footage and product capture described in the beat sheet.',
        },
        edit: { state: 'not_configured', note: 'No final export has been rendered yet.' },
        review: { state: 'pending', note: 'Owner approval is required before TikTok publishing.' },
      };
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
        script: idea.script ?? null,
        hashtags: Array.isArray(idea.hashtags) ? idea.hashtags.slice(0, 5) : [],
        media_type: isDeadsetCarousel ? 'photo' : 'video',
        asset_manifest: isDeadsetCarousel
          ? {
              version: 1,
              format: 'two_slide_photo_carousel',
              style: 'native_real_photo_to_feature_proof',
              feature,
              slides,
              creative_brief: creativeBrief,
              source_policy: 'licensed_real_only',
              licence_note:
                'Pinterest is reference-only. Use creator-owned or explicitly licensed stock and record the original source.',
              generated_people: false,
              fabricated_ui: false,
              quality_gate: {
                classification: 'draft_carousel',
                publishable: false,
                required_before_publish: [
                  'licensed source recorded',
                  'exact current app screenshot verified',
                  'final two-slide export reviewed',
                  'owner confirms caption, CTA and disclosure',
                ],
              },
            }
          : {
              version: 1,
              format: 'shoot_ready_video_brief',
              creative_brief: creativeBrief,
              quality_gate: {
                classification: 'shoot_ready_brief',
                publishable: false,
                minimum_publishability_score: 16,
                scoring_scale: 20,
                required_before_publish: [
                  'real footage recorded or licensed',
                  'sound cleared and selected',
                  'first three seconds reviewed frame by frame',
                  'exact export reviewed with sound and muted',
                  'owner confirms posting consent, CTA and disclosure',
                ],
              },
            },
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
