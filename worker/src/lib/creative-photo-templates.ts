import type { CreativePlaybook, HookVisualTemplate } from './creative-playbooks';

export const DEADSET_NATIVE_TEMPLATE = 'deadset-casual-gym-v2';
/** A validated source vocabulary, not arbitrary model-authored search URLs. */
export function selectHookTemplate(playbook: CreativePlaybook, artifactId: string): HookVisualTemplate | undefined {
  if (playbook.appSlug !== 'deadset' || !playbook.hookVisualTemplate) return playbook.hookVisualTemplate;
  const index = [...artifactId].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 3;
  const base = playbook.hookVisualTemplate;
  if (index === 2) return { ...base, id: DEADSET_NATIVE_TEMPLATE,
    searchQuery: 'person walking car parking evening',
    requiredAltTermGroups: [['person', 'man', 'woman'], ['car', 'vehicle', 'parking']],
    direction: 'Unposed gym-arrival or ordinary evening car context; no automotive advert.' };
  return { ...base, id: DEADSET_NATIVE_TEMPLATE,
    searchQuery: index === 0 ? 'gym floor shoes dumbbells workout' : 'person resting gym bench workout',
    requiredAltTermGroups: [['gym', 'fitness', 'workout'], ['dumbbell', 'shoe', 'bench', 'weight', 'rest', 'person', 'man', 'woman']],
    direction: index === 0 ? 'Casual gym-floor POV, shoes, bottle or equipment; naturally imperfect phone framing.'
      : 'Ordinary between-set rest or bench-side moment; relaxed and unposed.',
    gateLabel: 'native gym moment',
  };
}
