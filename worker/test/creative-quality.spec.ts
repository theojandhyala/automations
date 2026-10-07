import { describe, expect, it } from 'vitest';
import { assessCreativeQuality } from '../src/lib/creative-quality';

describe('native creative quality gate', () => {
  it('accepts a ten-slide Deadset exercise sequence with five ordered cues and a complete promotion', () => {
    const slides = Array.from({length:10},(_,i)=>({
      role:i===0?'hook':i===4?'feature_proof':'editorial',
      overlay:i===0?'Five lifts worth saving':i===4?'Keep the work. See the change.':([1,2,3,5,6].includes(i)?`${String([1,2,3,5,6].indexOf(i)+1).padStart(2,'0')}. exercise cue`:'Useful training note'),
      body:i===4?'Track the work in Deadset. Available on the App Store.':'Short useful cue.',
    }));
    const result=assessCreativeQuality({hook:'Five lifts worth saving',caption:'Keep your training together in Deadset. Find Deadset on the App Store.',hashtags:['deadset','gymtok','gymtips'],mediaType:'photo',assetManifest:{app_slug:'deadset',format:'deadset_rules_carousel',longform_kind:'exercise_sequence',slides,promotional:true,generated_media:false,generated_people:false,fabricated_ui:false,source_policy:'creator_authorized_only'}});
    expect(result.pass).toBe(true);
    expect(result.blockers).toEqual([]);
  });
  it('passes a specific two-slide native concept', () => {
    const result = assessCreativeQuality({
      hook: 'Would you fish this window or wait?',
      caption: 'I check the conditions before choosing a mark.',
      hashtags: ['fishing', 'angling', 'cast'],
      mediaType: 'photo',
      assetManifest: {
        format: 'two_slide_photo_carousel',
        slides: [{ role: 'hook' }, { role: 'feature_proof' }],
        generated_people: false,
        fabricated_ui: false,
      },
      photoUrls: ['https://media.example/one.jpg', 'https://media.example/two.jpg'],
    });

    expect(result.pass).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(75);
  });

  it('requires LifeScore and Reclaim posts to prove a registered feature without health claims', () => {
    const valid = assessCreativeQuality({
      hook: 'Stop trying to perfect every single day',
      caption: 'A small check-in for the day you actually had.',
      hashtags: ['lifescore', 'dailyroutine', 'habits'],
      mediaType: 'photo',
      assetManifest: {
        app_slug: 'lifescore', format: 'two_slide_photo_carousel', feature: 'studio_proof_v1',
        product_truth: 'LifeScore tracks a daily picture across routine areas; it is not a medical assessment.',
        release_context: 'preview; no availability claims',
        slides: [{ role: 'hook' }, { role: 'feature_proof', app_asset_key: 'studio_proof_v1' }],
        production: { feature_asset: { id: 'owned-life-score-screen', source_kind: 'owner_upload', composition: 'app_screen' } },
      },
    });
    expect(valid.pass).toBe(true);

    const unsafe = assessCreativeQuality({
      hook: 'A proven cure for addiction',
      caption: 'Download Reclaim now for a perfect streak.',
      hashtags: ['reclaim', 'checkin', 'reflection'],
      mediaType: 'photo',
      assetManifest: {
        app_slug: 'reclaim', format: 'two_slide_photo_carousel', feature: 'unknown',
        product_truth: '', release_context: 'preview; no availability claims',
        slides: [{ role: 'hook' }, { role: 'feature_proof', app_asset_key: 'unknown' }],
        production: { feature_asset: { id: 'third-party', source_kind: 'remote_url', composition: 'phone_mockup' } },
      },
    });
    expect(unsafe.pass).toBe(false);
    expect(unsafe.blockers.join(' ')).toMatch(/registered first-party|medical, recovery-outcome|Preview creative/);
  });

  it('blocks generic ad copy and incomplete final media', () => {
    const result = assessCreativeQuality({
      hook: 'Are you tired of struggling? Download now!!',
      caption: 'Try it.',
      hashtags: ['app'],
      mediaType: 'photo',
      assetManifest: {
        format: 'two_slide_photo_carousel',
        slides: [{ role: 'hook' }, { role: 'feature_proof' }],
      },
      photoUrls: ['https://media.example/one.jpg'],
    });

    expect(result.pass).toBe(false);
    expect(result.blockers.join(' ')).toMatch(/advertisement/);
    expect(result.blockers.join(' ')).toMatch(/exactly two/);
  });

  it('blocks stock-library photos from final Deadset media', () => {
    const result = assessCreativeQuality({
      hook: 'what changed since last week?',
      caption: 'Deadset keeps the work visible.',
      hashtags: ['deadset', 'gymtok', 'gymprogress'],
      mediaType: 'photo',
      photoUrls: ['https://media.example/hook.jpg', 'https://media.example/proof.jpg'],
      assetManifest: {
        app_slug: 'deadset',
        format: 'two_slide_photo_carousel',
        source_policy: 'creator_authorized_only',
        hook_visual_template: { id: 'deadset-candid-person-v3' },
        slides: [{ role: 'hook' }, { role: 'feature_proof', overlay: 'See the change.' }],
        production: { stock: { source_url: 'https://www.pexels.com/photo/123/' } },
      },
    });
    expect(result.pass).toBe(false);
    expect(result.blockers.join(' ')).toMatch(/cannot use stock-library photography/i);
  });

  it('rejects a caption that is only an app-store instruction', () => {
    const result = assessCreativeQuality({
      hook: 'Ever wonder what actually worked this week?',
      caption: 'deadset on appstore',
      hashtags: ['gymtok', 'lifting', 'deadset'],
      mediaType: 'photo',
      assetManifest: {
        format: 'two_slide_photo_carousel',
        slides: [{ role: 'hook' }, { role: 'feature_proof' }],
      },
      photoUrls: ['https://media.example/one.jpg', 'https://media.example/two.jpg'],
    });

    expect(result.pass).toBe(false);
    expect(result.blockers.join(' ')).toMatch(/human observation/);
  });

  it('keeps long captions as a warning while retaining the Deadset short-post text limit', () => {
    const result = assessCreativeQuality({
      hook: 'Same lift. What did you lift last time?',
      caption: 'Deadset keeps every single training detail together so your next gym session becomes much easier to remember.',
      hashtags: ['deadset', 'gymtok', 'gymprogress'],
      mediaType: 'photo',
      assetManifest: {
        app_slug: 'deadset',
        format: 'two_slide_photo_carousel',
        generated_people: false,
        fabricated_ui: false,
        hook_visual_template: { id: 'deadset-candid-person-v3' },
        slides: [
          { role: 'hook', overlay: 'Same lift. What did you lift last time?' },
          { role: 'feature_proof', overlay: 'Check your previous working set now' },
        ],
      },
    });
    expect(result.pass).toBe(false);
    expect(result.blockers).toEqual(expect.arrayContaining([
      'Deadset short-post setup must fit in seven words.',
      'Deadset short-post payoff must fit in four words.',
    ]));
  });

  it('rejects Deadset hooks that do not set up the exact feature proof', () => {
    const result = assessCreativeQuality({
      hook: 'How many sets did you do today?',
      caption: 'One less thing to guess between sets.',
      hashtags: ['deadset', 'gymtok', 'gymprogress'],
      mediaType: 'photo',
      assetManifest: {
        app_slug: 'deadset',
        feature: 'progression_board',
        format: 'two_slide_photo_carousel',
        hook_visual_template: { id: 'deadset-candid-person-v3' },
        slides: [{ role: 'hook' }, { role: 'feature_proof', overlay: 'Check the last set.' }],
      },
    });
    expect(result.pass).toBe(false);
    expect(result.blockers.join(' ')).toMatch(/progression_board proof/);
  });

  it('rejects an unsupported strength-outcome promise', () => {
    const result = assessCreativeQuality({
      hook: 'What weight did you use last time?',
      caption: 'Deadset helps you get stronger.',
      hashtags: ['deadset', 'gymtok', 'gymprogress'],
      mediaType: 'photo',
      assetManifest: {
        app_slug: 'deadset',
        feature: 'progression_board',
        format: 'two_slide_photo_carousel',
        hook_visual_template: { id: 'deadset-candid-person-v3' },
        slides: [{ role: 'hook' }, { role: 'feature_proof', overlay: 'Check the last set.' }],
      },
    });
    expect(result.pass).toBe(false);
    expect(result.blockers.join(' ')).toMatch(/makes the viewer stronger/);
  });

  it('blocks a Deadset carousel that bypasses the saved car-walk template', () => {
    const result = assessCreativeQuality({
      hook: 'What can twelve weeks actually change?',
      caption: 'I wanted the progress to be easy to see. Deadset on the App Store.',
      hashtags: ['gymtok', 'gymprogress', 'workoutapp'],
      mediaType: 'photo',
      assetManifest: {
        app_slug: 'deadset',
        format: 'two_slide_photo_carousel',
        slides: [{ role: 'hook' }, { role: 'feature_proof' }],
        generated_people: false,
        fabricated_ui: false,
      },
      photoUrls: ['https://media.example/one.jpg', 'https://media.example/two.jpg'],
    });

    expect(result.pass).toBe(false);
    expect(result.blockers.join(' ')).toMatch(/casual gym visual template/i);
  });

  it('does not release an old Deadset template marker without current visual review', () => {
    const result = assessCreativeQuality({
      hook: 'What can twelve weeks actually change?',
      caption: 'I wanted the progress to be easy to see. Deadset on the App Store.',
      hashtags: ['gymtok', 'gymprogress', 'workoutapp'],
      mediaType: 'photo',
      assetManifest: {
        app_slug: 'deadset',
        format: 'two_slide_photo_carousel',
        hook_visual_template: { id: 'deadset-casual-car-walk-v1' },
        slides: [{ role: 'hook' }, { role: 'feature_proof' }],
        generated_people: false,
        fabricated_ui: false,
      },
      photoUrls: ['https://media.example/one.jpg', 'https://media.example/two.jpg'],
    });

    expect(result.pass).toBe(false);
    expect(result.blockers.join(' ')).toMatch(/Exact final slides/);
  });

  it('blocks a Cast carousel that bypasses the saved fishing-decision template', () => {
    const result = assessCreativeQuality({
      hook: 'Would you fish this spot or keep walking?',
      caption: 'The conditions decide whether I stay. Cast on the App Store.',
      hashtags: ['fishingtok', 'ukfishing', 'angling'],
      mediaType: 'photo',
      assetManifest: {
        app_slug: 'cast',
        format: 'two_slide_photo_carousel',
        slides: [{ role: 'hook' }, { role: 'feature_proof' }],
        generated_people: false,
        fabricated_ui: false,
      },
      photoUrls: ['https://media.example/one.jpg', 'https://media.example/two.jpg'],
    });

    expect(result.pass).toBe(false);
    expect(result.blockers.join(' ')).toMatch(/fishing-decision visual template/i);
  });

  it('does not release an old Cast template marker without current visual review', () => {
    const result = assessCreativeQuality({
      hook: 'Would you fish this spot or keep walking?',
      caption: 'The conditions decide whether I stay. Cast on the App Store.',
      hashtags: ['fishingtok', 'ukfishing', 'angling'],
      mediaType: 'photo',
      assetManifest: {
        app_slug: 'cast',
        format: 'two_slide_photo_carousel',
        hook_visual_template: { id: 'cast-fishing-decision-v2' },
        slides: [{ role: 'hook' }, { role: 'feature_proof' }],
        generated_people: false,
        fabricated_ui: false,
      },
      photoUrls: ['https://media.example/one.jpg', 'https://media.example/two.jpg'],
    });

    expect(result.pass).toBe(false);
    expect(result.blockers.join(' ')).toMatch(/Exact final slides/);
  });

  it('holds the legacy Deadset progress export for visual re-review', () => {
    const result = assessCreativeQuality({
      hook: 'Did the work actually add up?',
      caption: 'Training feels different when the progress is impossible to forget. Deadset on the App Store.',
      hashtags: ['gymtok', 'gymprogress', 'workouttracker', 'workoutapp'],
      mediaType: 'photo',
      assetManifest: {
        app_slug: 'deadset',
        format: 'two_slide_photo_carousel',
        hook_visual_template: { id: 'deadset-casual-car-walk-v1' },
        slides: [{ role: 'hook' }, { role: 'feature_proof' }],
        generated_people: false,
        fabricated_ui: false,
      },
      photoUrls: ['deadset-carousel-progress-receipts-slide-1.png', 'deadset-carousel-progress-receipts-slide-2.png'],
    });

    expect(result.pass).toBe(false);
    expect(result.blockers.join(' ')).toMatch(/Exact final slides/);
  });

  it('holds the legacy Cast export for visual re-review', () => {
    const result = assessCreativeQuality({
      hook: 'Worth the drive tonight?',
      caption: 'I check the live score, tide and recommended hour before I waste the drive. Cast on the App Store.',
      hashtags: ['fishingtok', 'ukfishing', 'angling', 'fishingapp'],
      mediaType: 'photo',
      assetManifest: {
        app_slug: 'cast',
        format: 'two_slide_photo_carousel',
        hook_visual_template: { id: 'cast-fishing-decision-v2' },
        slides: [{ role: 'hook' }, { role: 'feature_proof' }],
        generated_people: false,
        fabricated_ui: false,
      },
      photoUrls: ['cast-carousel-worth-the-drive-slide-1.png', 'cast-carousel-worth-the-drive-slide-2.png'],
    });

    expect(result.pass).toBe(false);
    expect(result.blockers.join(' ')).toMatch(/Exact final slides/);
  });
});
