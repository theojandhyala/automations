import { completeJson } from '../lib/ai';
import { getCreativePlaybook, photoSystem, productTruth } from '../lib/creative-playbooks';
import type { CreativePlaybook } from '../lib/creative-playbooks';
import {
  planCreativeFeatures,
  type CreativeArtifactSignal,
  type CreativeMetricSignal,
} from '../lib/creative-intelligence';
import { assessCreativeQuality } from '../lib/creative-quality';
import type { Handler } from './registry';

interface App {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  app_store_url: string | null;
}

export interface DraftIdea {
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
- Motion begins immediately. A real performance, field action, hands, first-person demonstration,
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

function containsForbiddenClaim(text: string, claims: string[]): string | null {
  const lower = text.toLowerCase();
  return claims.find((claim) => lower.includes(claim)) ?? null;
}

function hasMeaningfulHook(value: string): boolean {
  const words = value.match(/[\p{L}\p{N}]+/gu) ?? [];
  return value.trim().length >= 8 && words.length >= 2;
}

/**
 * The model is allowed to be creative, but it is not allowed to make a
 * promotion mission unreliable. If every free-form candidate misses a truth
 * or shape gate, these server-owned concepts keep the run moving using only
 * verified feature copy from the playbook.
 */
export function buildCarouselFallbacks(
  playbook: CreativePlaybook,
  allowedFeatures: string[],
  needed: number,
  existingIdeas: DraftIdea[] = [],
  recentHooks: string[] = [],
): DraftIdea[] {
  if (needed <= 0 || allowedFeatures.length === 0) return [];

  const usedFeatures = new Set(existingIdeas.map((idea) => idea.feature).filter(Boolean));
  const featureOrder = [
    ...allowedFeatures.filter((feature) => !usedFeatures.has(feature)),
    ...allowedFeatures.filter((feature) => usedFeatures.has(feature)),
  ];
  const usedHooks = new Set(
    [...recentHooks, ...existingIdeas.map((idea) => idea.hook)]
      .filter(Boolean)
      .map((hook) => hook.trim().toLowerCase()),
  );
  const session = playbook.category === 'fishing' ? 'session' : 'workout';
  const fallbacks: DraftIdea[] = [];

  for (let index = 0; index < featureOrder.length * 6 && fallbacks.length < needed; index += 1) {
    const feature = featureOrder[index % featureOrder.length]!;
    const spec = playbook.features[feature];
    if (!spec) continue;
    const variant = Math.floor(index / featureOrder.length);
    const candidates = [
      spec.fallbackHook,
      `${spec.label}: the check I make before the next ${session}`,
      `The ${spec.label.toLowerCase()} detail I kept forgetting`,
      `One ${spec.label.toLowerCase()} screen before the next ${session}`,
      `The ${spec.label.toLowerCase()} check after the last ${session}`,
      `${spec.label}: the part I want saved for next time`,
    ];
    const hook = candidates[variant];
    if (!hook || hook.length > 120 || usedHooks.has(hook.toLowerCase())) continue;
    usedHooks.add(hook.toLowerCase());
    fallbacks.push({
      hook,
      caption: spec.fallbackCaption,
      hashtags: playbook.defaultHashtags.slice(0, 5),
      shot_notes: `two 1080x1920 stills; ${spec.stockDirection}; native bold white text with black outline; exact app capture`,
      audience: playbook.category === 'fishing' ? 'anglers making their next session decision' : 'lifters planning their next workout',
      single_promise: spec.truth,
      hook_hypothesis: `A familiar ${playbook.category} decision earns attention before the exact product proof.`,
      proof_shown: spec.truth,
      feature,
      slides: [
        {
          role: 'hook',
          overlay: hook,
          asset_query: spec.stockDirection,
          source_requirement: 'licensed real photo; record source and licence',
        },
        {
          role: 'feature_proof',
          overlay: spec.fallbackProofOverlay,
          app_asset_key: feature,
          source_requirement: `exact current ${playbook.appName} screenshot; no rebuilt UI`,
        },
      ],
    });
  }
  return fallbacks;
}

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
    const playbook = getCreativePlaybook(app.slug);
    if (!playbook) throw new Error(`${app.name} does not have an active, verified promotion playbook`);

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
    const recent = await ctx.db.select<CreativeArtifactSignal>(
      'artifacts',
      `app_id=eq.${app.id}&select=id,hook,status,asset_manifest,published_at&order=created_at.desc&limit=60`,
    );
    const recentHooks = recent.map((r) => r.hook).filter(Boolean);

    await ctx.setTask(`drafting ${count} concepts for ${app.name}`);
    ctx.log('debug', 'seeded with recent hooks', { recent: recentHooks.length });

    const isCarousel = config.content_format === 'photo_carousel';
    const featureKeys = Object.keys(playbook.features);
    const allowedFeatures = (config.feature_rotation?.length ? config.feature_rotation : featureKeys)
      .filter((key) => key in playbook.features);
    if (isCarousel && allowedFeatures.length === 0) throw new Error('no verified feature keys are enabled for this carousel');
    // Ask for spare candidates because the deterministic truth gate may reject
    // a structurally valid model response. This is especially important for a
    // one-concept mission, where one wrong free-form feature key previously
    // caused the entire run to fail without a second chance.
    const candidateCount = isCarousel ? Math.min(Math.max(count * 3, count), 10) : count;
    let metrics: CreativeMetricSignal[] = [];
    const publishedIds = recent.filter((artifact) => artifact.status === 'published').map((artifact) => artifact.id);
    if (isCarousel && publishedIds.length) {
      try {
        metrics = await ctx.db.select<CreativeMetricSignal>(
          'post_metrics',
          `artifact_id=in.(${publishedIds.join(',')})&select=artifact_id,captured_at,views,likes,comments,shares&order=captured_at.desc&limit=200`,
        );
      } catch (error) {
        ctx.log('warn', 'creative analytics unavailable; continuing in learning mode', {
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }
    const plan = planCreativeFeatures(playbook, allowedFeatures, recent, metrics, candidateCount);
    const featureAssignments = isCarousel
      ? plan.decisions.map((decision) => decision.feature)
      : [];
    let ideas: DraftIdea[] = [];
    let generationMode: 'workers_ai' | 'verified_fallback' = 'workers_ai';
    try {
      const result = await completeJson<{ ideas: DraftIdea[] }>(ctx.env, {
        system: isCarousel ? photoSystem(playbook) : `${SYSTEM}\n\n${productTruth(playbook)}`,
        maxTokens: isCarousel ? 2800 : 2600,
        prompt: [
          `App: ${app.name}`,
          app.tagline ? `Tagline: ${app.tagline}` : null,
          isCarousel
            ? `Allowed feature rotation: ${allowedFeatures.join(', ')}`
            : null,
          isCarousel
            ? `Content intelligence mode: ${plan.mode}. Decisions: ${plan.decisions.map((decision) => `${decision.feature} (${decision.reason})`).join('; ')}.`
            : null,
          isCarousel && allowedFeatures.length === 1
            ? `Every candidate MUST use this exact feature key: ${allowedFeatures[0]}. Its hook and proof must directly resolve through that feature.`
            : null,
          isCarousel
            ? `Required candidate-to-feature assignment, in order: ${featureAssignments.map((feature, index) => `${index + 1}=${feature}`).join(', ')}. Write each candidate specifically for its assigned feature.`
            : null,
          config.extra_context ? `Context: ${config.extra_context}` : null,
          config.creative_brief ? `Creative brief: ${JSON.stringify(config.creative_brief)}` : null,
          recentHooks.length ? `Already used, do not repeat:\n- ${recentHooks.join('\n- ')}` : null,
          isCarousel
            ? `Write ${candidateCount} distinct candidate ideas. The system will keep the best ${count} that pass its truth checks.`
            : `Write ${count} new ideas.`,
        ]
          .filter(Boolean)
          .join('\n'),
      });
      ideas = Array.isArray(result.ideas) ? result.ideas : [];
      if (!ideas.length && !isCarousel) throw new Error('model returned no ideas');
      if (!ideas.length && isCarousel) generationMode = 'verified_fallback';
    } catch (error) {
      if (!isCarousel) throw error;
      generationMode = 'verified_fallback';
      ctx.log('warn', 'Workers AI unavailable; using the verified autonomous carousel brain', {
        reason: error instanceof Error ? error.message : String(error),
      });
    }

    const normalizedIdeas = ideas.map((idea, index) => {
      const hook = idea.hook?.trim() ?? '';
      return {
        ...idea,
        // Product-proof routing is campaign configuration, not a creative
        // model decision. The model is told the assignment, while the stored
        // key is always taken from the verified server-side rotation.
        feature: isCarousel ? featureAssignments[index % featureAssignments.length] : idea.feature,
        // The hook is the viewer-facing copy. Never substitute the model's
        // stock-search phrase into this field.
        hook,
      };
    });
    const seenFeatures = new Set<string>();
    const validIdeas = normalizedIdeas.filter((idea) => {
      const combined = `${idea.hook ?? ''} ${idea.caption ?? ''} ${idea.single_promise ?? ''}`;
      const forbidden = containsForbiddenClaim(combined, playbook.claimsToAvoid);
      let reason: string | null = null;
      const quality = assessCreativeQuality({
        hook: idea.hook ?? null,
        caption: idea.caption ?? null,
        hashtags: Array.isArray(idea.hashtags) ? idea.hashtags : [],
        mediaType: isCarousel ? 'photo' : 'video',
        assetManifest: isCarousel ? { format: 'two_slide_photo_carousel', slides: idea.slides ?? [] } : {},
      });
      if (!idea.hook?.trim() || idea.hook.trim().length > 120 || !hasMeaningfulHook(idea.hook)) {
        reason = 'hook is missing, meaningless or too long';
      }
      else if (!quality.pass) reason = `native quality gate: ${[...quality.blockers, ...quality.warnings].join(' ')}`;
      else if (!idea.caption?.trim()) reason = 'caption is missing';
      else if (!Array.isArray(idea.hashtags) || idea.hashtags.length < 3) reason = 'fewer than three hashtags';
      else if (forbidden) reason = `forbidden claim: ${forbidden}`;
      else if (isCarousel && (!idea.feature || !allowedFeatures.includes(idea.feature))) reason = 'unverified feature key';
      else if (isCarousel && idea.feature && seenFeatures.has(idea.feature) && allowedFeatures.length >= count) reason = 'duplicate feature';
      else if (!isCarousel && (!idea.script || (idea.script.match(/\d{1,2}:\d{2}/g)?.length ?? 0) < 3)) {
        reason = 'video brief lacks three timestamped beats';
      }
      if (reason) {
        ctx.log('warn', 'discarded creative that failed the playbook gate', { hook: idea.hook, reason, playbook: playbook.version });
        return false;
      }
      if (idea.feature) seenFeatures.add(idea.feature);
      return true;
    });
    const acceptedIdeas: DraftIdea[] = validIdeas.slice(0, count);
    if (isCarousel && acceptedIdeas.length < count) {
      const recovered = buildCarouselFallbacks(
        playbook,
        [...new Set(plan.decisions.map((decision) => decision.feature))],
        count - acceptedIdeas.length,
        acceptedIdeas,
        recentHooks as string[],
      );
      acceptedIdeas.push(...recovered);
      if (recovered.length) {
        ctx.log('warn', 'recovered rejected model output with verified playbook fallbacks', {
          recovered: recovered.length,
          playbook: playbook.version,
        });
      }
    }
    if (acceptedIdeas.length === 0) throw new Error(`all generated ideas failed ${playbook.appName} playbook ${playbook.version}`);

    const now = new Date().toISOString();

    const rows = acceptedIdeas.map((idea) => {
      const rawSlides = Array.isArray(idea.slides) ? idea.slides.slice(0, 2) : [];
      const feature = isCarousel ? idea.feature! : null;
      const featureSpec = feature ? playbook.features[feature] : null;
      const slides = isCarousel
        ? [
            {
              role: 'hook' as const,
              // Keep creative control over the hook, but keep asset sourcing
              // server-owned so a vague model query cannot select an abstract
              // or off-category photo.
              overlay: idea.hook,
              asset_query: featureSpec?.stockDirection ?? rawSlides[0]?.asset_query ?? idea.shot_notes,
              source_requirement:
                rawSlides[0]?.source_requirement ?? 'licensed real photo; record original source and licence',
            },
            {
              role: 'feature_proof' as const,
              // The exact screenshot already carries product detail. Use the
              // concise verified payoff instead of allowing model-written ad
              // copy to obscure the real UI.
              overlay: featureSpec?.fallbackProofOverlay ?? 'the proof, in the app',
              // The feature key is chosen from the verified playbook, never
              // trusted from a second free-form model field.
              app_asset_key: feature,
              source_requirement:
                rawSlides[1]?.source_requirement ?? `exact current ${playbook.appName} screenshot; no rebuilt UI`,
            },
          ]
        : [];
      const creativeBrief = {
        goal: config.creative_brief?.goal ?? null,
        audience: idea.audience ?? config.creative_brief?.audience ?? null,
        angle: config.creative_brief?.angle ?? null,
        single_promise: idea.single_promise ?? null,
        hook_hypothesis: idea.hook_hypothesis ?? config.creative_brief?.hypothesis ?? null,
        proof_shown: idea.proof_shown ?? feature,
        footage_provenance: isCarousel
          ? 'creator-owned or explicitly licensed still; source and licence must be recorded'
          : 'creator-owned or explicitly licensed real footage; generated people may not represent customers',
        generated_people: false,
      };
      const decision = plan.decisions.find((candidate) => candidate.feature === feature) ?? null;
      const finalCaption = idea.caption.toLowerCase().includes(playbook.captionSuffix)
        ? idea.caption
        : `${idea.caption.replace(/[.\s]+$/, '')}. ${playbook.captionSuffix}`;
      const creativeQuality = assessCreativeQuality({
        hook: idea.hook,
        caption: finalCaption,
        hashtags: Array.isArray(idea.hashtags) ? idea.hashtags.slice(0, 5) : [],
        mediaType: isCarousel ? 'photo' : 'video',
        assetManifest: isCarousel ? { format: 'two_slide_photo_carousel', slides } : {},
      });
      const stages = {
        research: {
          state: 'done',
          at: now,
          note: `Analysed ${plan.analysis_window} recent artifacts and ${plan.measured_posts} measured posts in ${plan.mode} mode.`,
        },
        concept: { state: 'done', at: now },
        script: isCarousel
          ? { state: 'done', at: now, note: 'Two-slide hook and exact product-proof sequence is specified.' }
          : idea.script
            ? { state: 'done', at: now, note: 'Timestamped shoot-ready beat sheet is attached.' }
            : { state: 'not_configured', note: 'The model did not return a complete timestamped beat sheet.' },
        assets: {
          state: 'not_configured',
          note: isCarousel
            ? `The producer must attach a licensed real photo and exact current ${playbook.appName} capture.`
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
        caption: finalCaption,
        // Persisted, not just logged: these are the filming and editing
        // instructions, and the review queue is where they are actually needed.
        shot_notes: idea.shot_notes ?? null,
        script: idea.script ?? null,
        hashtags: Array.isArray(idea.hashtags) ? idea.hashtags.slice(0, 5) : [],
        media_type: isCarousel ? 'photo' : 'video',
        asset_manifest: isCarousel
          ? {
              version: 1,
              playbook_version: playbook.version,
              app_slug: playbook.appSlug,
              format: 'two_slide_photo_carousel',
              style: 'native_real_photo_to_feature_proof',
              feature,
              slides,
              creative_brief: creativeBrief,
              creative_intelligence: {
                mode: plan.mode,
                generation: generationMode,
                measured_posts: plan.measured_posts,
                analysis_window: plan.analysis_window,
                feature_decision: decision,
              },
              creative_quality: creativeQuality,
              source_policy: 'licensed_real_only',
              licence_note:
                'Pinterest is reference-only. Use creator-owned or explicitly licensed stock and record the original source.',
              generated_people: false,
              fabricated_ui: false,
              quality_gate: {
                classification: 'validated_draft_carousel',
                publishable: false,
                concept_gate_passed: true,
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
              playbook_version: playbook.version,
              app_slug: playbook.appSlug,
              format: 'shoot_ready_video_brief',
              creative_brief: creativeBrief,
              creative_quality: creativeQuality,
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
    for (const idea of acceptedIdeas) {
      ctx.log('info', `drafted: ${idea.hook}`, { shot_notes: idea.shot_notes });
    }

    return {
      app: app.slug,
      playbook: playbook.version,
      drafted: rows.length,
      discarded: ideas.length - validIdeas.length,
      recovered: Math.max(0, rows.length - Math.min(validIdeas.length, count)),
      generation_mode: generationMode,
      intelligence_mode: plan.mode,
      measured_posts: plan.measured_posts,
    };
  },
};
