import type { CreativePlaybook, HookVisualTemplate } from './creative-playbooks';

export const DEADSET_NATIVE_TEMPLATE = 'deadset-candid-person-v3';
/** Source search is only a shortlist; final pixels still need independent review. */
export function selectHookTemplate(playbook: CreativePlaybook, artifactId: string): HookVisualTemplate | undefined {
  if (playbook.appSlug !== 'deadset' || !playbook.hookVisualTemplate) return playbook.hookVisualTemplate;
  const index = [...artifactId].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 3;
  const base = playbook.hookVisualTemplate;
  const candidates = [
    { searchQuery: 'person black car street casual', context: ['car', 'vehicle'],
      direction: 'A stylish real person casually getting into or beside a dark car, caught mid-movement. The owner’s beanie/black-car example is the reference feel, not a required BMW badge. No glossy automotive shoot.' },
    { searchQuery: 'person getting into car candid', context: ['car', 'vehicle'],
      direction: 'A candid person arriving at or getting into a car, natural clothing and phone-photo framing. The person and moment lead; the car is context.' },
    { searchQuery: 'person walking street casual outfit', context: ['street', 'walking', 'outdoor', 'pavement', 'sidewalk'],
      direction: 'A stylish real person in an ordinary street or arrival moment, naturally framed like a personal camera-roll photo. No posed catalogue outfit or fitness campaign.' },
  ];
  const selected = candidates[index]!;
  return { ...base, id: DEADSET_NATIVE_TEMPLATE, searchQuery: selected.searchQuery,
    requiredAltTermGroups: [['person', 'man', 'woman', 'people'], selected.context],
    direction: selected.direction, gateLabel: 'candid person-led opener',
  };
}
