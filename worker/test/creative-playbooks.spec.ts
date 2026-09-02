import { describe, expect, it } from 'vitest';
import {
  getCreativePlaybook,
  normalizeCaption,
  photoSystem,
  planCarouselContentLanes,
  productTruth,
} from '../src/lib/creative-playbooks';
import { buildCarouselFallbacks, selectCreativeHashtags } from '../src/automations/tiktok-generate';
import { planCreativeFeatures } from '../src/lib/creative-intelligence';

describe('verified creative playbooks', () => {
  it('keeps Deadset fitness and Cast fishing content completely separate', () => {
    const deadset = getCreativePlaybook('deadset')!;
    const cast = getCreativePlaybook('cast')!;
    expect(deadset.category).toBe('fitness');
    expect(cast.category).toBe('fishing');
    expect(deadset.defaultHashtags).toEqual(expect.arrayContaining(['gymtok', 'workoutapp']));
    expect(deadset.defaultHashtags).not.toEqual(expect.arrayContaining(['fishingtok', 'angling']));
    expect(cast.defaultHashtags).toEqual(expect.arrayContaining(['fishingtok', 'angling']));
    expect(cast.defaultHashtags).not.toEqual(expect.arrayContaining(['gymtok', 'workoutapp']));
  });

  it('locks Cast carousels to six real product features', () => {
    const cast = getCreativePlaybook('cast')!;
    expect(Object.keys(cast.features)).toEqual([
      'bite_forecast', 'fishkey', 'catch_map', 'catch_log', 'records', 'crew',
    ]);
    expect(cast.features.fishkey?.truth).toMatch(/does not claim automatic AI photo recognition/);
    expect(cast.features.catch_map?.truth).toMatch(/approximate area or no location/);
  });

  it('puts Cast claim restrictions and exact-screen instructions into every carousel prompt', () => {
    const cast = getCreativePlaybook('cast')!;
    const prompt = photoSystem(cast);
    expect(prompt).toContain('guaranteed catch');
    expect(prompt).toContain('exact current Cast screenshot');
    expect(prompt).toContain('Cast on the App Store.');
    expect(cast.hookVisualTemplate?.id).toBe('cast-fishing-decision-v2');
    expect(cast.hookVisualTemplate?.direction).toMatch(/fishing decision moment beside visible water/i);
    expect(cast.hookVisualTemplate?.captionStyle).toBe(getCreativePlaybook('deadset')!.hookVisualTemplate?.captionStyle);
    expect(prompt).toContain('required for every Cast photo carousel');
    expect(prompt).toContain('Reject posed trophy shots');
    expect(prompt).toContain('catalogue-style walking shots');
    expect(prompt).not.toContain('image without both a person and a car');

    const fallback = buildCarouselFallbacks(cast, ['bite_forecast'], 1)[0]!;
    expect(fallback.slides?.[0]?.asset_query).toBe(cast.hookVisualTemplate?.searchQuery);
  });

  it('keeps the approved Deadset video grammar in the model context', () => {
    const truth = productTruth(getCreativePlaybook('deadset')!);
    expect(truth).toContain('real creator-shot weighted gym motion');
    expect(truth).toContain('continuous real Deadset recording');
    expect(truth).toContain('Return to the lifter');
  });

  it('locks every Deadset carousel to the saved casual car-walk template', () => {
    const deadset = getCreativePlaybook('deadset')!;
    const prompt = photoSystem(deadset);
    const fallback = buildCarouselFallbacks(deadset, ['workout_plan'], 1)[0]!;

    expect(deadset.hookVisualTemplate?.id).toBe('deadset-casual-car-walk-v1');
    expect(deadset.hookVisualTemplate?.direction).toMatch(/mid-step toward any parked car/i);
    expect(deadset.hookVisualTemplate?.captionStyle).toMatch(/TikTok Classic-style semi-bold white/i);
    expect(prompt).toContain('required for every Deadset photo carousel');
    expect(prompt).toContain('Reject key close-ups');
    expect(fallback.slides?.[0]?.asset_query).toBe(deadset.hookVisualTemplate?.searchQuery);
  });

  it('schedules occasional Deadset heartbreak and villain lanes without running them back-to-back', () => {
    const deadset = getCreativePlaybook('deadset')!;
    const ordinary = Array.from({ length: 5 }, () => ({
      asset_manifest: { content_lane: { id: 'car_lifestyle' } },
    }));
    const heartbreak = planCarouselContentLanes(deadset, ordinary, 3);
    expect(heartbreak.map((entry) => entry.lane.id)).toEqual([
      'heartbreak_rebuild', 'car_lifestyle', 'car_lifestyle',
    ]);
    expect(heartbreak[0]?.lane.featureKey).toBe('muscle_diagram');
    expect(heartbreak[0]?.lane.proofOverlay).toBe('Enough.');

    const immediatelyAfter = planCarouselContentLanes(deadset, [
      { asset_manifest: { content_lane: { id: 'heartbreak_rebuild' } } },
      ...ordinary,
    ], 3);
    expect(immediatelyAfter.every((entry) => entry.lane.id === 'car_lifestyle')).toBe(true);

    const villain = planCarouselContentLanes(deadset, [
      ...ordinary,
      { asset_manifest: { content_lane: { id: 'heartbreak_rebuild' } } },
    ], 3);
    expect(villain[0]?.lane.id).toBe('villain_arc');
  });

  it('builds the requested emotional payoff from verified Deadset truth', () => {
    const deadset = getCreativePlaybook('deadset')!;
    const lane = deadset.creativeStrategy.lanes.heartbreak_rebuild!;
    const fallback = buildCarouselFallbacks(deadset, ['muscle_diagram'], 1, [], [], lane)[0]!;
    expect(fallback.hook).toBe('How much did it hurt?');
    expect(fallback.creative_lane).toBe('heartbreak_rebuild');
    expect(fallback.feature).toBe('muscle_diagram');
    expect(fallback.slides?.[1]?.overlay).toBe('Enough.');
    expect(fallback.single_promise).toMatch(/not a body-transformation/i);
  });

  it('keeps captions and music direction production-safe while rejecting hashtag bait', () => {
    const deadset = getCreativePlaybook('deadset')!;
    const lane = deadset.creativeStrategy.lanes.villain_arc!;
    const hashtags = selectCreativeHashtags(deadset, lane, ['#viral', '#fyp', '#strengthtraining']);
    expect(hashtags).toContain('gymtok');
    expect(hashtags).toContain('strengthtraining');
    expect(hashtags).not.toEqual(expect.arrayContaining(['viral', 'fyp']));
    expect(deadset.creativeStrategy.captionTreatment).toMatch(/pure white fill, clean 5px black outside stroke/i);
    expect(lane.soundMood).toMatch(/Commercial Music Library/i);
    expect(photoSystem(deadset)).toContain('Direct photo posting can request TikTok recommended music but cannot name an exact track');
  });

  it('does not activate an unverified LifeScore promotion model', () => {
    expect(getCreativePlaybook('lifescore')).toBeNull();
  });

  it('normalizes legacy captions without duplicating the App Store sign-off', () => {
    expect(normalizeCaption(
      "'When I measured it. cast on appstore",
      'Cast on the App Store.',
    )).toBe('When I measured it. Cast on the App Store.');

    expect(normalizeCaption(
      'One less thing to guess. Deadset on the App Store.',
      'Deadset on the App Store.',
    )).toBe('One less thing to guess. Deadset on the App Store.');

    expect(normalizeCaption(
      "Who's up for a fishing trip? Cast on the App Store.",
      'Cast on the App Store.',
    )).toBe("Who's up for a fishing trip? Cast on the App Store.");
  });

  it('recovers a Cast batch with distinct, verified two-slide concepts', () => {
    const cast = getCreativePlaybook('cast')!;
    const fallbacks = buildCarouselFallbacks(
      cast,
      ['bite_forecast', 'fishkey', 'catch_map'],
      3,
      [],
      [cast.features.bite_forecast!.fallbackHook],
    );

    expect(fallbacks).toHaveLength(3);
    expect(new Set(fallbacks.map((idea) => idea.hook)).size).toBe(3);
    expect(fallbacks.every((idea) => idea.feature && idea.feature in cast.features)).toBe(true);
    expect(fallbacks.every((idea) => idea.slides?.length === 2)).toBe(true);
    expect(fallbacks.every((idea) => idea.hashtags.length >= 3)).toBe(true);
    expect(fallbacks.map((idea) => idea.hook)).not.toContain(cast.features.bite_forecast!.fallbackHook);
  });

  it('uses measured performance without starving untested verified features', () => {
    const deadset = getCreativePlaybook('deadset')!;
    const published = {
      id: 'published-1', hook: 'old hook', status: 'published', published_at: '2026-08-30T10:00:00Z',
      asset_manifest: { feature: 'progression_board' },
    };
    const plan = planCreativeFeatures(
      deadset,
      ['progression_board', 'live_logger', 'workout_plan'],
      [published],
      [{ artifact_id: 'published-1', captured_at: '2026-08-31T10:00:00Z', views: 12_000, likes: 800, comments: 90, shares: 140 }],
      3,
    );

    expect(plan.mode).toBe('performance_informed');
    expect(plan.measured_posts).toBe(1);
    expect(plan.decisions.map((decision) => decision.feature)).toEqual(expect.arrayContaining([
      'progression_board', 'live_logger', 'workout_plan',
    ]));
    expect(plan.decisions.find((decision) => decision.feature === 'progression_board')?.latest_views).toBe(12_000);
  });
});
