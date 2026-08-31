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
});
