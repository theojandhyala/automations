import { describe, expect, it } from 'vitest';
import { carouselRenderReason, revisedPausedDraftMayBeReviewed } from '../src/lib/carousel-render-queue';
import { runOutcomeCounts } from '../src/lib/run-outcome-counts';
import type { Artifact } from '../src/types';

function draft(overrides: Partial<Artifact> = {}): Artifact {
  return { status: 'draft', media_type: 'photo', photo_urls: ['one.jpg', 'two.jpg'],
    stages: {}, scheduled_for: null, publish_id: null, tiktok_post_id: null,
    asset_manifest: { slides: [{ role: 'hook' }, { role: 'feature_proof' }],
      production: { renderer: 'cloudflare_browser_paid_bounded_session', caption_renderer: 'old' } },
    ...overrides } as Artifact;
}
const reason = (artifact: Artifact, app = 'deadset') => carouselRenderReason(artifact, app, 'current');

describe('carousel repair queue', () => {
  it('selects outdated system drafts and unrendered drafts, but not current exports', () => {
    expect(reason(draft())).toBe('outdated_renderer');
    expect(reason(draft({ photo_urls: [], asset_manifest: {} }))).toBe('unrendered');
    const current = draft();
    (current.asset_manifest.production as Record<string, string>).caption_renderer = 'current';
    expect(reason(current)).toBeNull();
    expect(reason(draft(), 'cast')).toBeNull();
  });
  it.each(['approved', 'publishing', 'published', 'rejected', 'failed'] as const)('preserves %s artifacts', status => {
    expect(reason(draft({ status }))).toBeNull();
  });
  it('preserves explicit holds, reviewed assets and exact delivery bookings', () => {
    for (const overrides of [
      { scheduled_for: '2026-09-13T11:00:00Z' }, { publish_id: 'existing' }, { tiktok_post_id: 'existing' },
      ...['scheduled', 'cancelled', 'failed', 'published'].map(state => ({ stages: { delivery: { state } } })),
      { stages: { review: { state: 'done' } } },
    ]) expect(reason(draft(overrides))).toBeNull();
    for (const manifest of [{ requires_owner_review: true }, { native_visual_review: { result: 'pass' } }]) {
      const item = draft(); Object.assign(item.asset_manifest, manifest);
      expect(reason(item)).toBeNull();
    }
  });
  it('never silently replaces native imports, unknown production, or long-form exports', () => {
    for (const renderer of ['native_import', 'unknown']) {
      const item = draft(); item.asset_manifest.production = { renderer, caption_renderer: 'old' };
      expect(reason(item)).toBeNull(); item.photo_urls = []; expect(reason(item)).toBeNull();
    }
    expect(reason(draft({ asset_manifest: {} }))).toBeNull();
    expect(reason(draft({ photo_urls: Array(10).fill('slide.jpg') }))).toBeNull();
    const item = draft(); item.asset_manifest.slides = Array(10).fill({});
    expect(reason(item)).toBeNull();
  });
});

describe('safe run outcome logging', () => {
  it('distinguishes a zero-delivery success without logging copy, URLs or arbitrary fields', () => {
    expect(runOutcomeCounts({ published: 0, submitted: 2, caption: 'private copy', secret: 'private',
      blocked: ['details'], failed: -1, produced: NaN, skipped: 1.5 })).toEqual({ published: 0, submitted: 2 });
    expect(runOutcomeCounts(null)).toEqual({});
  });
});

describe('cancelled draft review repair', () => {
  it('permits critique after a matching fresh inspection without changing delivery pause or render eligibility', () => {
    const item=draft({hook:'Hook',caption:'Caption',stages:{delivery:{state:'cancelled',at:'2026-09-13T10:00:00Z'}}});
    item.asset_manifest.app_slug='cast';
    item.asset_manifest.requires_owner_review=false;
    item.asset_manifest.native_visual_review={standard:'native-photo-2026-09-10',result:'pass',reviewer:'agent',checked_at:'2026-09-13T11:00:00Z',hook:item.hook,caption:item.caption,photo_urls:item.photo_urls,full_frame:true,native_photo:true,truth_and_rights:true,all_slides_inspected:true,notes:'Inspected exact exports and source provenance.'};
    expect(revisedPausedDraftMayBeReviewed(item)).toBe(true);
    expect(item.stages.delivery?.state).toBe('cancelled');
    expect(reason(item)).toBeNull();
    item.photo_urls=['changed.jpg','two.jpg'];
    expect(revisedPausedDraftMayBeReviewed(item)).toBe(false);
    item.photo_urls=['one.jpg','two.jpg'];
    item.stages.delivery!.at='2026-09-13T12:00:00Z';
    expect(revisedPausedDraftMayBeReviewed(item)).toBe(false);
  });
});
