import { describe, expect, it } from 'vitest';
import { validateConfig } from '../src/lib/schemas';
import { getCreativePlaybook } from '../src/lib/creative-playbooks';
import { choosePhoto } from '../src/automations/tiktok-produce';
import type { PexelsPhoto } from '../src/lib/pexels';

function photo(id: number, alt: string): PexelsPhoto {
  return {
    id,
    alt,
    width: 1080,
    height: 1920,
    url: `https://www.pexels.com/photo/${id}/`,
    photographer: 'Test photographer',
    photographer_url: 'https://www.pexels.com/@test/',
    src: {
      original: `https://images.pexels.com/photos/${id}/original.jpg`,
      portrait: `https://images.pexels.com/photos/${id}/portrait.jpg`,
      large2x: `https://images.pexels.com/photos/${id}/large2x.jpg`,
    },
  };
}

describe('mission-scoped carousel production', () => {
  it('accepts an exact source draft run and rejects malformed run ids', () => {
    const sourceRunId = '55555555-5555-4555-8555-555555555555';
    expect(validateConfig('tiktok.produce', {
      app_slug: 'cast',
      max_per_run: 3,
      source_run_id: sourceRunId,
    })).toMatchObject({ source_run_id: sourceRunId });

    expect(() => validateConfig('tiktok.produce', {
      app_slug: 'cast',
      source_run_id: 'not-a-run-id',
    })).toThrow(/source_run_id/);
  });

  it('selects only photos that pass the saved Deadset person-and-car vibe gate', () => {
    const template = getCreativePlaybook('deadset')!.hookVisualTemplate!;
    const candidates = [
      photo(1, 'Athlete lifting a barbell in a bright gym'),
      photo(2, 'A person walking toward a parked car in a dark parking lot at night'),
      photo(3, 'A glossy sports car photographed alone in a studio'),
    ];

    expect(choosePhoto(candidates, 'artifact-a', 'fitness', template.requiredAltTermGroups)?.id).toBe(2);
    expect(choosePhoto([candidates[0]!], 'artifact-b', 'fitness', template.requiredAltTermGroups)).toBeNull();
  });

  it('selects only photos that pass the saved Cast angler-and-water vibe gate', () => {
    const template = getCreativePlaybook('cast')!.hookVisualTemplate!;
    const candidates = [
      photo(4, 'An empty lake below a colourful sunset'),
      photo(5, 'A person walking along a river bank with fishing rods at dusk'),
      photo(6, 'A fisherman posing with a large fish in a studio'),
    ];

    expect(choosePhoto(candidates, 'artifact-c', 'fishing', template.requiredAltTermGroups)?.id).toBe(5);
    expect(choosePhoto([candidates[0]!], 'artifact-d', 'fishing', template.requiredAltTermGroups)).toBeNull();
  });
});
