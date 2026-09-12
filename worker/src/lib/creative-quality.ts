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
  if (/\b(?:app\s*store|download|install)\b/i.test(caption) && captionWords.length < 7) {
    score -= 30;
    warnings.push('Add a human observation before the app mention; a bare download caption reads like an ad.');
  }
  if (caption.length > 280) {
    score -= 10;
    warnings.push('Shorten the caption so the product proof does the selling.');
  }
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
  if (input.mediaType === 'photo') {
    const visualBlocker = nativeVisualReviewBlocker(input);
    if (visualBlocker) blockers.push(visualBlocker);
  }
  if (input.mediaType === 'photo' && manifest.format === 'two_slide_photo_carousel') {
    const slides = Array.isArray(manifest.slides) ? manifest.slides : [];
    if (slides.length !== 2) blockers.push('Native carousel format requires exactly two planned slides.');
    if (input.photoUrls && input.photoUrls.length !== 2) blockers.push('Attach exactly two final slides in posting order.');
    if (manifest.generated_people === true || manifest.fabricated_ui === true) {
      blockers.push('Generated people and rebuilt app UI are not allowed in this format.');
    }
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
  }
  if (manifest.format === DEADSET_LONGFORM) {
    const slides = Array.isArray(manifest.slides) ? manifest.slides : [];
    if (manifest.app_slug !== 'deadset' || input.mediaType !== 'photo' || slides.length !== 10 || (input.photoUrls && input.photoUrls.length !== 10)) blockers.push('Long Deadset requires exactly ten ordered photos.');
    if (slides.some((s, i) => s.role !== (i === 0 ? 'hook' : i === 4 ? 'feature_proof' : 'editorial'))) blockers.push('Place the genuine Deadset promotion after rule three, on slide five.');
    const rules = [1,2,3,5,6,7,8].map(i=>slides[i]);
    if(rules.some((s,i)=>!new RegExp(`^${i+1}[.)]\\s`).test(s?.overlay ?? ''))) blockers.push('Deliver seven distinct numbered rules in order.');
    if (manifest.generated_media !== false || manifest.generated_people !== false || manifest.fabricated_ui !== false || manifest.source_policy !== 'licensed_real_only') blockers.push('Long Deadset requires real sourced photos and unchanged product evidence.');
    if(slides.some(s=>typeof s.overlay!=='string'||s.overlay.length>90||typeof s.body!=='string'||s.body.length>120)) blockers.push('Keep each rule concise and phone-readable.');
    const promo = `${slides[4]?.overlay ?? ''} ${slides[4]?.body ?? ''}`;
    if(manifest.promotional!==true || !/\bDeadset\b/.test(promo) || !/app store/i.test(promo) || !/\bDeadset\b/.test(caption) || !/app store/i.test(caption)) blockers.push('The product slide and caption must visibly name Deadset and include an App Store CTA.');
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
    if (input.photoUrls?.length) {
      const production = manifest.production as { per_slide_sources?: Array<{ id?: number; source_url?: string }> } | undefined;
      const sources = production?.per_slide_sources ?? [];
      const identities = sources.map(source => source.id ? `pexels:${source.id}` : source.source_url?.replace(/[?#].*$/, '').replace(/\/$/, ''));
      if (sources.length !== 6 || identities.some(id => !id) || new Set(identities).size !== 6)
        blockers.push('Cast requires six distinct recorded photo sources. Replace repeated backgrounds before release.');
    }
    if (manifest.app_slug !== 'cast' || input.mediaType !== 'photo') blockers.push('Cast editorial must be a Cast photo carousel.');
    if (slides.length !== 6 || (input.photoUrls && input.photoUrls.length !== 6)) blockers.push('Cast editorial requires all six slides in order.');
    if (manifest.generated_media !== false || manifest.generated_people !== false || manifest.fabricated_ui !== false || manifest.source_policy !== 'licensed_real_only') blockers.push('Cast editorial requires real, sourced media.');
    if (slides.some(s => !s || typeof s.overlay !== 'string' || !s.overlay.trim() || s.overlay.length > 90 || typeof s.body !== 'string' || s.body.length > 120)) blockers.push('Shorten editorial copy before rendering.');
    const lastSlide = slides[5];
    const payoff = `${lastSlide?.overlay ?? ''} ${lastSlide?.body ?? ''}`;
    if (manifest.promotional !== true || !/\bCast\b/.test(payoff) || !/\bapp store\b/i.test(payoff))
      blockers.push('Every Cast carousel must promote Cast with a truthful product benefit and App Store call to action on the final slide.');
    if (!/\bCast\b/.test(caption) || !/\bapp store\b/i.test(caption))
      blockers.push('The caption must name Cast and include its App Store call to action.');
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
