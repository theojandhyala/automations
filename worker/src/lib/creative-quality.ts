import { normalizeHashtags } from './hashtags';

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
  if (input.mediaType === 'photo' && manifest.format === 'two_slide_photo_carousel') {
    const slides = Array.isArray(manifest.slides) ? manifest.slides : [];
    if (slides.length !== 2) blockers.push('Native carousel format requires exactly two planned slides.');
    if (input.photoUrls && input.photoUrls.length !== 2) blockers.push('Attach exactly two final slides in posting order.');
    if (manifest.generated_people === true || manifest.fabricated_ui === true) {
      blockers.push('Generated people and rebuilt app UI are not allowed in this format.');
    }
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
