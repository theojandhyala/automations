import { describe, expect, it } from 'vitest';
import { formatHashtags, normalizeHashtags } from '../src/lib/hashtags';

describe('TikTok hashtag normalization', () => {
  it('splits legacy joined hashtags into separate TikTok tags', () => {
    expect(normalizeHashtags(['#gymtok#gymprogress#workoutplan'])).toEqual([
      'gymtok',
      'gymprogress',
      'workoutplan',
    ]);
  });

  it('adds real markers, lowercases and deduplicates tags', () => {
    expect(formatHashtags(['GymTok', '#gymtok', 'workout_app', '#Deadset'])).toBe(
      '#gymtok #workout_app #deadset',
    );
  });

  it('keeps only TikTok-safe tag characters and caps output', () => {
    expect(normalizeHashtags(['#gym-tok, #lifting!', 'deadset', 'progress', 'training'], 4)).toEqual([
      'gym',
      'lifting',
      'deadset',
      'progress',
    ]);
  });
});
