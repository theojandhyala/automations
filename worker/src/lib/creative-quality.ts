import { castPromotionEvidenceBlocker } from './cast-promotion';
import { DEADSET_LONGFORM } from './deadset-longform';
import { CAST_EDITORIAL_FORMAT } from './cast-editorial';
import { normalizeHashtags } from './hashtags';
import { nativeVisualReviewBlocker } from './native-visual-review';
import {
  CAST_HOOK_VISUAL_TEMPLATE_ID,
  DEADSET_HOOK_VISUAL_TEMPLATE_ID,
} from './creative-playbooks';

export interface CreativeQualityInput {
  hook: string | null;
  caption: string | null;
  hashtags: string[];
  mediaType: 'video' | 'photo';
  assetManifest?: Record<string, unknown>;
  photoUrls?: string[];
  videoUrl?: string | null;
}

export interface CreativeQualityAssessment {
  version: 'native-v1';
  score: number;
  pass: boolean;
  hook_word_count: number;
  blockers: string[];
  warnings: string[];
}

const AD_SPEAK = [
  /\bare you tired of\b/i,
  /\bstruggling with\b/i,
  /\bdownload now\b/i,
  /\btry (?:it|this|the app) now\b/i,
  /\brevolutionary\b/i,
  /\bgame[- ]?changing\b/i,
  /\bultimate (?:app|solution|tool)\b/i,
  /\bunlock your\b/i,
  /\bguaranteed\b/i,
];

const SOFT_AD_SPEAK = [
  /\bperfect\b/i,
  /\boverwhelming\b/i,
  /\byou need this\b/i,
  /\bapp store\b/i,
  /\blink in bio\b/i,
];

const DEADSET_FEATURE_HOOK_TERMS: Record<string, RegExp> = {
  muscle_diagram: /\b(?:muscle|target|exercise|train|training)\b/i,
  training_heatmap: /\b(?:consistent|consistency|week|weeks|session|sessions|history|volume)\b/i,
  pr_wall: /\b(?:pr|record|number|lift|set)\b/i,
  progression_board: /\b(?:weight|load|last|previous|progress|lift)\b/i,
  workout_plan: /\b(?:plan|week|session|workout|next|training|train)\b/i,
  live_logger: /\b(?:set|sets|rep|reps|weight|log|logged|record|today|workout)\b/i,
};

const WELLBEING_APP_CLAIMS = /\b(?:cure|treat(?:ment)?|therapy|diagnos(?:e|is)|guarantee(?:d)?|proven|quit|detox|withdrawal|days? sober|replace professional help)\b/i;
const WELLBEING_PROOF_KEYS: Record<string, readonly string[]> = {
  lifescore: ['studio_proof_v1'],
  reclaim: ['studio_proof_v2'],
};

function words(value: string): string[] {
  return value.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)?/gu) ?? [];
}

/**
 * A deterministic native-content check that runs after generation and again
 * immediately before approval. It does not predict virality; it prevents the
 * most common low-quality failure modes from reaching the owner or TikTok.
 */
export function assessCreativeQuality(input: CreativeQualityInput): CreativeQualityAssessment {
  const hook = input.hook?.trim() ?? '';
  const caption = input.caption?.trim() ?? '';
  const hookWords = words(hook);
  const blockers: string[] = [];
  const warnings: string[] = [];
  let score = 100;

  if (!hook || hookWords.length < 3) blockers.push('Hook needs at least three meaningful words.');
  if (hook.length > 90 || hookWords.length > 14) blockers.push('Hook must be readable in one glance (14 words maximum).');
  if (AD_SPEAK.some((pattern) => pattern.test(hook))) blockers.push('Hook sounds like an advertisement instead of a native post.');
  if (/\b(download|install|subscribe|buy)\b/i.test(hook)) blockers.push('Keep download or purchase commands out of the opening hook.');
  if (/!{2,}|\?{2,}/.test(hook)) {
    score -= 10;
    warnings.push('Use one punctuation mark; repeated punctuation reads as engagement bait.');
  }
  if (hook && hook === hook.toUpperCase() && /[A-Z]{4}/.test(hook)) {
    score -= 12;
    warnings.push('Sentence case will feel more native than all caps.');
  }
  if (SOFT_AD_SPEAK.some((pattern) => pattern.test(hook))) {
    score -= 24;
    warnings.push('Replace generic ad language with a specific human thought or decision.');
  }

  const emojiCount = (hook.match(/\p{Extended_Pictographic}/gu) ?? []).length;
  if (emojiCount > 1) {
    score -= 8;
    warnings.push('Keep the opening text visually quiet; use at most one emoji.');
  }

  const captionWords = words(caption);
  if (!caption || captionWords.length < 3) blockers.push('Caption needs one short, human sentence.');
  if (/^(?:deadset|cast)?\s*(?:on\s+)?(?:the\s+)?app\s*store[.!?]*$/i.test(caption)) blockers.push('Caption needs a human observation, not a bare store instruction.');
  if (captionWords.length > 12 || caption.length > 110) blockers.push('Caption must be one native sentence of at most 12 words.');
  // Owner direction: captions include one concise download action; avoid additional CTA stuffing elsewhere.
  const rawHashtags = input.hashtags ?? [];
  const hashtags = normalizeHashtags(rawHashtags);
  const joinedHashtags = rawHashtags.some((tag) => (tag.match(/#/g) ?? []).length > 1);
  if (joinedHashtags) {
    blockers.push('Hashtags must be separate tokens, for example #gymtok #gymprogress.');
  }
  if (hashtags.length < 3 || hashtags.length > 5) {
    score -= 10;
    warnings.push('Use three to five relevant hashtags.');
  }

  const manifest = input.assetManifest ?? {};
  if (input.mediaType === 'photo' && manifest.app_slug === 'deadset' && input.photoUrls?.length) {
    const recordedSources = JSON.stringify({
      production: manifest.production ?? null,
      slides: manifest.slides ?? null,
    });
    if (/pexels\.com|unsplash\.com|pixabay\.com|shutterstock\.com|stock\.adobe\.com/i.test(recordedSources)) {
      blockers.push('Deadset cannot use stock-library photography. Replace it with owner-shot or creator-authorized personal gym media.');
    }
    if (!['creator_authorized_only', 'owner_authorized_reference_guided_generation'].includes(String(manifest.source_policy))) {
      blockers.push('Deadset final media must declare creator-authorized or owner-authorized generated provenance before release.');
    }
  }
  if (input.mediaType === 'photo') {
    // A signed independent final-image review is the current release
    // evidence. Legacy native-review records remain accepted for imported
    // packages, but cannot be required in addition to the signed review for
    // newly rendered Cloudflare media.
    const signedReview = manifest.visual_review as { pass?: unknown } | undefined;
    const visualBlocker = signedReview?.pass === true ? null : nativeVisualReviewBlocker(input);
    if (visualBlocker) blockers.push(visualBlocker);
  }
  if (input.mediaType === 'photo' && manifest.format === 'two_slide_photo_carousel') {
    const slides = Array.isArray(manifest.slides) ? manifest.slides : [];
    if (slides.length !== 2) blockers.push('Native carousel format requires exactly two planned slides.');
    if (input.photoUrls && input.photoUrls.length !== 2) blockers.push('Attach exactly two final slides in posting order.');
    const generatedPeopleAuthorized = manifest.generated_people === true
      && manifest.generated_media === true
      && manifest.source_policy === 'owner_authorized_reference_guided_generation';
    if ((manifest.generated_people === true && !generatedPeopleAuthorized) || manifest.fabricated_ui === true) {
      blockers.push('People need recorded owner-authorized generation provenance and app UI must remain genuine.');
    }
    if (manifest.app_slug === 'deadset' && hookWords.length > 7) blockers.push('Deadset short-post setup must fit in seven words.');
    if (manifest.app_slug === 'deadset' && /\b(?:helps? you )?(?:get|grow|become) stronger\b/i.test(`${hook} ${caption}`)) {
      blockers.push('Deadset copy cannot promise that the app makes the viewer stronger.');
    }
    const deadsetLane = typeof manifest.content_lane === 'string' ? manifest.content_lane : 'daily_utility';
    if (manifest.app_slug === 'deadset' && deadsetLane === 'daily_utility' && typeof manifest.feature === 'string') {
      const featureTerms = DEADSET_FEATURE_HOOK_TERMS[manifest.feature];
      if (featureTerms && !featureTerms.test(hook)) {
        blockers.push(`Deadset hook must set up the ${manifest.feature} proof shown on slide two.`);
      }
    }
    const payoff = slides[1] && typeof slides[1] === 'object' && 'overlay' in slides[1]
      ? String((slides[1] as { overlay?: unknown }).overlay ?? '').trim()
      : '';
    if (manifest.app_slug === 'deadset' && payoff && words(payoff).length > 4) blockers.push('Deadset short-post payoff must fit in four words.');
    const requiredHookTemplate = manifest.app_slug === 'deadset'
      ? {
          id: DEADSET_HOOK_VISUAL_TEMPLATE_ID,
          blocker: 'Deadset slide one must use a validated casual gym visual template.',
        }
      : manifest.app_slug === 'cast'
        ? {
            id: CAST_HOOK_VISUAL_TEMPLATE_ID,
            blocker: 'Cast slide one must use the saved real fishing-decision visual template.',
          }
        : null;
    if (requiredHookTemplate) {
      const visualTemplate = manifest.hook_visual_template;
      const templateId = visualTemplate && typeof visualTemplate === 'object' && 'id' in visualTemplate
        ? visualTemplate.id
        : null;
      const legacyDeadset = manifest.app_slug === 'deadset' && templateId === 'deadset-casual-car-walk-v1';
      if (templateId !== requiredHookTemplate.id && !legacyDeadset) {
        blockers.push(requiredHookTemplate.blocker);
      }
    }

    // LifeScore and Reclaim are useful, app-led editorial formats. They may
    // never use a generic wellbeing claim in place of real product evidence.
    // This repeats the renderer's intent at the release boundary, where a
    // manually changed database row is otherwise capable of bypassing it.
    const wellbeingProofKeys = WELLBEING_PROOF_KEYS[String(manifest.app_slug)];
    if (wellbeingProofKeys) {
      const slides = Array.isArray(manifest.slides) ? manifest.slides as Array<{ role?: unknown; app_asset_key?: unknown }> : [];
      const production = manifest.production as {
        feature_asset?: { id?: unknown; source_kind?: unknown; composition?: unknown };
      } | undefined;
      const truth = typeof manifest.product_truth === 'string' ? manifest.product_truth.trim() : '';
      if (!truth || truth.length < 24) blockers.push('Record the specific, truthful product context before releasing a wellbeing-app post.');
      if (!wellbeingProofKeys.includes(String(manifest.feature))) blockers.push('Use a registered first-party app feature for this account.');
      if (slides.length !== 2 || slides[0]?.role !== 'hook' || slides[1]?.role !== 'feature_proof'
        || !wellbeingProofKeys.includes(String(slides[1]?.app_asset_key))) {
        blockers.push('Wellbeing-app posts need a relatable hook followed by the registered app proof.');
      }
      if (production?.feature_asset?.source_kind !== 'owner_upload' || production.feature_asset.composition !== 'app_screen'
        || typeof production.feature_asset.id !== 'string' || !production.feature_asset.id) {
        blockers.push('Wellbeing-app posts need a recorded owner-uploaded app screen as their proof.');
      }
      if (WELLBEING_APP_CLAIMS.test(`${hook} ${caption}`)) {
        blockers.push('Remove medical, recovery-outcome, or guaranteed-result claims from wellbeing-app creative.');
      }
      if (/\b(?:download|install|available now|on the app store)\b/i.test(`${hook} ${caption}`)
        && manifest.release_context === 'preview; no availability claims') {
        blockers.push('Preview creative cannot claim the wellbeing app is publicly available.');
      }
    }
  }
  if (manifest.format === DEADSET_LONGFORM) {
    const slides = Array.isArray(manifest.slides) ? manifest.slides : [];
    if (manifest.app_slug !== 'deadset' || input.mediaType !== 'photo' || slides.length !== 10 || (input.photoUrls && input.photoUrls.length !== 10)) blockers.push('Long Deadset requires exactly ten ordered photos.');
    if (slides.some((s, i) => s.role !== (i === 0 ? 'hook' : i === 4 ? 'feature_proof' : 'editorial'))) blockers.push('Place the genuine Deadset promotion after rule three, on slide five.');
    const exerciseSequence = manifest.longform_kind === 'exercise_sequence';
    const numberedSlides = (exerciseSequence ? [1,2,3,5,6] : [1,2,3,5,6,7,8]).map(i=>slides[i]);
    if(numberedSlides.some((s,i)=>!new RegExp(`^0?${i+1}[.)]\\s`).test(s?.overlay ?? ''))) blockers.push(exerciseSequence ? 'Deliver five distinct numbered exercise cues in order.' : 'Deliver seven distinct numbered rules in order.');
    const generatedLongAuthorized = manifest.generated_media === true && manifest.generated_people === true
      && manifest.source_policy === 'owner_authorized_reference_guided_generation';
    const creatorLongAuthorized = manifest.generated_media === false && manifest.generated_people === false
      && manifest.source_policy === 'creator_authorized_only';
    if ((!generatedLongAuthorized && !creatorLongAuthorized) || manifest.fabricated_ui !== false) blockers.push('Long Deadset requires creator-authorized or owner-authorized original gym media and unchanged product evidence.');
    if(slides.some(s=>typeof s.overlay!=='string'||s.overlay.length>90||typeof s.body!=='string'||s.body.length>120)) blockers.push('Keep each rule concise and phone-readable.');
    const promo = `${slides[4]?.overlay ?? ''} ${slides[4]?.body ?? ''}`;
    if(manifest.promotional!==true || !/\bDeadset\b/.test(promo) || !/app store/i.test(promo) || !/\bDeadset\b/i.test(caption)) blockers.push('The product slide must name Deadset and carry the App Store CTA; the short caption must name Deadset once.');
    if(input.photoUrls?.length){
      const production=manifest.production as {per_slide_sources?:Array<{source_url?:string;kind?:string}>,feature_asset?:{id?:string;composition?:string;source_kind?:string}}|undefined;
      const sources=production?.per_slide_sources??[];
      const photos=sources.filter((_,i)=>i!==4).map(s=>s.source_url?.replace(/[?#].*$/,''));
      if(sources.length!==10 || photos.some(s=>!s) || new Set(photos).size!==9 || sources[4]?.kind!=='first_party_ui') blockers.push('Record distinct real photographs and genuine product provenance for all ten slides.');
      if(!production?.feature_asset?.id || production.feature_asset.composition!=='app_screen' || production.feature_asset.source_kind!=='owner_upload') blockers.push('The promotion requires registered original product evidence for independent comparison.');
    }
  }
  if (manifest.format === CAST_EDITORIAL_FORMAT) {
    const slides = Array.isArray(manifest.slides) ? manifest.slides : [];
    const promotionIndex = slides.findIndex(s => s?.role === 'promotion');
    const expectedLengths = [3, 4, 6];
    if (input.photoUrls?.length) {
      const promotionBlocker = castPromotionEvidenceBlocker(manifest);
      if (promotionBlocker) blockers.push(promotionBlocker);
      const production = manifest.production as { per_slide_sources?: Array<{ id?: number; source_url?: string }> } | undefined;
      const sources = production?.per_slide_sources ?? [];
      const identities = sources.map(source => source.id ? `pexels:${source.id}` : source.source_url?.replace(/[?#].*$/, '').replace(/\/$/, ''));
      if (sources.length !== slides.length || identities.some(id => !id) || new Set(identities).size !== slides.length)
        blockers.push('Cast requires one distinct recorded source for every slide. Replace repeated backgrounds before release.');
    }
    if (manifest.app_slug !== 'cast' || input.mediaType !== 'photo') blockers.push('Cast editorial must be a Cast photo carousel.');
    if (!expectedLengths.includes(slides.length) || (input.photoUrls && input.photoUrls.length !== slides.length)) blockers.push('Cast editorial requires a complete reviewed 3, 4 or 6 slide sequence.');
    if (manifest.generated_media !== false || manifest.generated_people !== false || manifest.fabricated_ui !== false || manifest.source_policy !== 'licensed_real_only') blockers.push('Cast editorial requires real, sourced media.');
    if (slides.some(s => !s || typeof s.overlay !== 'string' || !s.overlay.trim() || s.overlay.length > 90 || typeof s.body !== 'string' || s.body.length > 120)) blockers.push('Shorten editorial copy before rendering.');
    const promotionSlide = promotionIndex >= 0 ? slides[promotionIndex] : slides.at(-1);
    const effectivePromotionIndex = promotionIndex >= 0 ? promotionIndex : slides.length - 1;
    const payoff = `${promotionSlide?.overlay ?? ''} ${promotionSlide?.body ?? ''}`;
    if (manifest.promotional !== true || !/\bCast\b/.test(payoff) || !/\bapp store\b/i.test(payoff))
      blockers.push('Every Cast carousel must include a truthful branded Cast benefit and App Store call to action.');
    const conversionPlan = manifest.conversion_plan as { promotion_index?: number } | undefined;
    if (conversionPlan && (effectivePromotionIndex < 1 || effectivePromotionIndex > 3))
      blockers.push('Reveal the Cast advertisement between slides two and four so viewers see the product before drop-off.');
    if (!/\bCast\b/i.test(caption)) blockers.push('The short caption must name Cast once.');
  }
  if (input.mediaType === 'video' && input.videoUrl !== undefined && !input.videoUrl) {
    blockers.push('Attach the final reviewed video export.');
  }

  score = Math.max(0, Math.min(100, score - blockers.length * 30));
  return {
    version: 'native-v1',
    score,
    pass: blockers.length === 0 && score >= 75,
    hook_word_count: hookWords.length,
    blockers,
    warnings,
  };
}
