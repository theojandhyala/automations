import { describe, expect, it } from 'vitest';
import { assessCreativeQuality } from '../src/lib/creative-quality';

describe('native creative quality gate', () => {
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
    expect(result.warnings.join(' ')).toMatch(/human observation/);
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
    expect(result.blockers.join(' ')).toMatch(/person-walking-to-a-car visual template/i);
  });

  it('accepts the saved Deadset car-walk template marker', () => {
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

    expect(result.pass).toBe(true);
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

  it('accepts the saved Cast fishing-decision template marker', () => {
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

    expect(result.pass).toBe(true);
  });
});
