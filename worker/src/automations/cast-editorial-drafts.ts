import type { RunContext } from '../lib/runner';
import { CAST_EDITORIAL_FORMAT, CAST_EDITORIAL_VERSION, CAST_REFERENCE_URLS, editorialSlides, planCastEditorial } from '../lib/cast-editorial';
import { assessCreativeQuality } from '../lib/creative-quality';

export async function createCastEditorialDrafts(ctx: RunContext, appId: string, accountId: string | null,
  count: number, recent: Array<{ hook?: string | null; asset_manifest: Record<string, unknown> }>) {
  const concepts = planCastEditorial(recent, Math.min(count, 3));
  if (!concepts.length) return { drafted: 0, generation_mode: 'curated_no_ai', reason: 'Curated Cast bank exhausted. Add new reviewed topics; do not repeat old posts.' };
  const now = new Date().toISOString();
  const rows = concepts.map(concept => {
    const slides = editorialSlides(concept);
    const manifest = {
      version: 1, app_slug: 'cast', format: CAST_EDITORIAL_FORMAT, playbook_version: CAST_EDITORIAL_VERSION,
      editorial_id: concept.id, promotional: concept.promotional, requires_owner_review: true,
      content_lane: { id: concept.promotional ? 'cast_context' : 'fishing_editorial', label: concept.promotional ? 'Occasional Cast story' : 'Useful fishing carousel' },
      reference_urls: CAST_REFERENCE_URLS, reference_usage: 'Structure study only. Original copy and independently licensed photos.',
      slides, generated_people: false, generated_media: false, fabricated_ui: false, source_policy: 'licensed_real_only',
      creative_intelligence: { generation: 'curated_no_ai', mode: 'unmeasured_editorial_test' },
      sound_plan: { mood: 'Understated fishing-native instrumental; no generated voice.', market: 'GB', commercial_eligibility_required: true, execution: 'owner_selects_eligible_audio' },
      quality_gate: { publishable: false, required_before_publish: ['Real photo provenance checked', 'All six rendered slides reviewed', 'Caption, disclosure and audio approved'] },
    };
    const hashtags = ['fishing', 'fishingtips', 'beginnerfishing', 'angling'];
    return {
      run_id: ctx.runId, app_id: appId, account_id: accountId, status: 'draft', stage: 'concept',
      hook: concept.hook, caption: concept.caption, hashtags, media_type: 'photo',
      shot_notes: 'Six stills: one real fishing photo hook, then five readable items over a consistent real waterside photo. No AI imagery, voice, fake reviews or competitor footage. 4 useful posts for each occasional Cast story.',
      script: slides.map((s, i) => `Slide ${i + 1}: ${s.overlay}${s.body ? ' — ' + s.body : ''}`).join('\n'),
      asset_manifest: { ...manifest, creative_quality: assessCreativeQuality({ hook: concept.hook, caption: concept.caption, hashtags, mediaType: 'photo', assetManifest: manifest }) },
      stages: { research: { state: 'done', at: now, note: 'Three r1pple8 carousels reviewed slide by slide on 2026-09-10.' }, concept: { state: 'done', at: now }, script: { state: 'done', at: now }, assets: { state: 'pending', note: 'Source licensed real fishing photos.' }, edit: { state: 'pending' }, review: { state: 'pending', note: 'New editorial format needs exact owner review.' } },
      brand_organic_toggle: concept.promotional, brand_content_toggle: false, is_aigc: false,
    };
  });
  await ctx.db.insertMany('artifacts', rows);
  return { drafted: rows.length, app: 'cast', generation_mode: 'curated_no_ai', editorial: rows.filter(r => !r.brand_organic_toggle).length, promotional: rows.filter(r => r.brand_organic_toggle).length };
}
