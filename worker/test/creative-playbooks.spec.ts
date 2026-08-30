import { describe, expect, it } from 'vitest';
import { getCreativePlaybook, photoSystem, productTruth } from '../src/lib/creative-playbooks';

describe('verified creative playbooks', () => {
  it('locks Cast carousels to six real product features', () => {
    const cast = getCreativePlaybook('cast')!;
    expect(Object.keys(cast.features)).toEqual([
      'bite_forecast', 'fishkey', 'catch_map', 'catch_log', 'records', 'crew',
    ]);
    expect(cast.features.fishkey?.truth).toMatch(/does not claim automatic AI photo recognition/);
    expect(cast.features.catch_map?.truth).toMatch(/approximate area or no location/);
  });

  it('puts Cast claim restrictions and exact-screen instructions into every carousel prompt', () => {
    const prompt = photoSystem(getCreativePlaybook('cast')!);
    expect(prompt).toContain('guaranteed catch');
    expect(prompt).toContain('exact current Cast screenshot');
    expect(prompt).toContain('cast on appstore');
  });

  it('keeps the approved Deadset video grammar in the model context', () => {
    const truth = productTruth(getCreativePlaybook('deadset')!);
    expect(truth).toContain('real creator-shot weighted gym motion');
    expect(truth).toContain('continuous real Deadset recording');
    expect(truth).toContain('Return to the lifter');
  });

  it('does not activate an unverified LifeScore promotion model', () => {
    expect(getCreativePlaybook('lifescore')).toBeNull();
  });
});
