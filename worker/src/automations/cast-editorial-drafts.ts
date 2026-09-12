import type { RunContext } from '../lib/runner';
import { CAST_EDITORIAL_FORMAT, CAST_EDITORIAL_VERSION, CAST_REFERENCE_URLS, editorialSlides, planCastEditorial } from '../lib/cast-editorial';
import { CREATIVE_DIRECTION_VERSION } from '../lib/creative-direction';
import { assessCreativeQuality } from '../lib/creative-quality';

export async function createCastEditorialDrafts(ctx: RunContext, appId: string, accountId: string | null,
  count: number, recent: Array<{ hook?: string | null; asset_manifest: Record<string, unknown> }>) {
  const concepts = planCastEditorial(recent, Math.min(count, 3));
  if (!concepts.length) return { drafted: 0, generation_mode: 'curated_no_ai', reason: 'Curated Cast bank exhausted. Add new reviewed topics; do not repeat old posts.' };
  const lessons = recent.flatMap(r => {
    const review = r.asset_manifest.visual_review as { pass?: boolean; blockers?: string[] } | undefined;
    return review?.pass === false ? [{ hook: r.hook, defects: review.blockers ?? [] }] : [];
  }).slice(0, 8);
  const now = new Date().toISOString();
  const rows = concepts.map(concept => {
    const slides = editorialSlides(concept);
    const manifest = {
      version: 1, app_slug: 'cast', format: CAST_EDITORIAL_FORMAT, playbook_version: CAST_EDITORIAL_VERSION,
      creative_direction_version: CREATIVE_DIRECTION_VERSION, lessons_to_address: lessons,
      editorial_id: concept.id, promotional: concept.promotional, requires_owner_review: true,
      content_lane: { id: concept.promotional ? 'cast_context' : 'fishing_editorial', label: 'Fishing advice with a Cast payoff' },
      reference_urls: CAST_REFERENCE_URLS, reference_usage: 'Structure study only. Original copy and independently licensed photos.',
      slides, generated_people: false, generated_media: false, fabricated_ui: false, source_policy: 'licensed_real_only',
      creative_intelligence: { generation: 'curated_no_ai', mode: 'unmeasured_editorial_test' },
      sound_plan: { mood: 'Catchy warm instrumental groove with a clear beat; contemporary, outdoorsy and upbeat, not sleepy background music. Listen before selecting; no generated voice.', market: 'GB', commercial_eligibility_required: true, execution: 'direct_api_auto_music_not_curated', selection_status: 'unselected', rejected_track: 'Travel — Trees and Lucy (owner rejected September 12)', limitation: 'Current publisher sends auto_add_music only. Do not claim an exact song was selected or approved. Use eligible native TikTok selection when available.' },
      quality_gate: { publishable: false, required_before_publish: ['Real photo provenance checked', 'All six rendered slides reviewed', 'Caption, disclosure and audio approved'] },
    };
    const hashtags = ['fishing', 'fishingtips', 'beginnerfishing', 'angling'];
    return {
      run_id: ctx.runId, app_id: appId, account_id: accountId, status: 'draft', stage: 'concept',
      hook: concept.hook, caption: concept.caption, hashtags, media_type: 'photo',
      shot_notes: 'Six distinct real fishing photos: one useful hook, five readable items, and a truthful Cast benefit plus App Store CTA integrated into the last item. No AI imagery, fake reviews or competitor footage.',
      script: slides.map((s, i) => `Slide ${i + 1}: ${s.overlay}${s.body ? ' — ' + s.body : ''}`).join('\n'),
      asset_manifest: { ...manifest, creative_quality: assessCreativeQuality({ hook: concept.hook, caption: concept.caption, hashtags, mediaType: 'photo', assetManifest: manifest }) },
      stages: { research: { state: 'done', at: now, note: 'Three r1pple8 carousels reviewed slide by slide on 2026-09-10.' }, concept: { state: 'done', at: now }, script: { state: 'done', at: now }, assets: { state: 'pending', note: 'Source licensed real fishing photos.' }, edit: { state: 'pending' }, review: { state: 'pending', note: 'New editorial format needs exact owner review.' } },
      brand_organic_toggle: concept.promotional, brand_content_toggle: false, is_aigc: false,
    };
  });
  await ctx.db.insertMany('artifacts', rows);
  return { drafted: rows.length, app: 'cast', generation_mode: 'curated_no_ai', editorial: rows.filter(r => !r.brand_organic_toggle).length, promotional: rows.filter(r => r.brand_organic_toggle).length };
}
