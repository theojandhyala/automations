export interface CreativeFeature {
  label: string;
  truth: string;
  stockDirection: string;
  fallbackHook: string;
  fallbackCaption: string;
  fallbackProofOverlay: string;
}

export interface HookVisualTemplate {
  id: string;
  direction: string;
  searchQuery: string;
  requiredAltTermGroups: string[][];
  captionStyle: string;
  variationRule: string;
  rejectionRule: string;
  gateLabel: string;
}

export interface CreativeContentLane {
  id: string;
  label: string;
  featureKey?: string;
  hookExamples: string[];
  captionExamples: string[];
  proofOverlay?: string;
  soundMood: string;
  hashtags: string[];
  rules: string[];
}

export interface CreativeStrategy {
  defaultLane: string;
  lanes: Record<string, CreativeContentLane>;
  occasionalRotation?: {
    lanes: string[];
    targetEveryPosts: number;
    minimumGapPosts: number;
  };
  captionTreatment: string;
  soundPolicy: string[];
  trendPolicy: string[];
  blockedHashtags: string[];
  learningMetrics: string[];
}

export interface CreativePlaybook {
  version: string;
  appSlug: 'deadset' | 'cast';
  appName: string;
  category: 'fitness' | 'fishing';
  positioning: string;
  captionSuffix: string;
  defaultHashtags: string[];
  hookVisualTemplate?: HookVisualTemplate;
  creativeStrategy: CreativeStrategy;
  features: Record<string, CreativeFeature>;
  claimsToAvoid: string[];
  videoShape: string[];
}

export const DEADSET_HOOK_VISUAL_TEMPLATE_ID = 'deadset-casual-car-walk-v1';
export const CAST_HOOK_VISUAL_TEMPLATE_ID = 'cast-fishing-decision-v2';

export const CREATIVE_PLAYBOOKS: Record<string, CreativePlaybook> = {
  deadset: {
    version: 'deadset-2026-09-02.1',
    appSlug: 'deadset',
    appName: 'Deadset',
    category: 'fitness',
    positioning: 'A gym planning and workout-tracking app that turns a plan, logged sets and training history into a clearer next workout.',
    captionSuffix: 'Deadset on the App Store.',
    defaultHashtags: ['gymtok', 'gymprogress', 'workoutplan', 'workoutapp'],
    hookVisualTemplate: {
      id: DEADSET_HOOK_VISUAL_TEMPLATE_ID,
      direction: 'A real, casual phone-style photo of one person seen from behind or at an angle, mid-step toward any parked car in an ordinary car park or roadside setting at evening or night. Keep the lighting naturally low, the framing slightly imperfect and the moment unposed. The car supports the lifestyle setup; it is not a glossy automotive shoot.',
      searchQuery: 'person walking toward parked car at night casual parking lot',
      requiredAltTermGroups: [
        ['car', 'vehicle', 'automobile'],
        ['person', 'man', 'woman', 'people'],
        ['walk', 'walking', 'approach', 'enter', 'parking', 'night', 'evening', 'dark'],
      ],
      captionStyle: 'TikTok Classic-style semi-bold white sans serif at a normal medium-heavy weight, clean 4-5px black outline, no box, no hollow lettering and no oversized cinematic title treatment.',
      variationRule: 'Vary the person, car, location and hook while keeping the same casual walk-up-at-low-light feeling.',
      rejectionRule: 'Reject key close-ups, posed portraits, gym stock, glossy car photography, cinematic colour grading and any image without both a person and a car.',
      gateLabel: 'person-and-car',
    },
    creativeStrategy: {
      defaultLane: 'car_lifestyle',
      lanes: {
        car_lifestyle: {
          id: 'car_lifestyle',
          label: 'Car-led relatable gym thought',
          hookExamples: [
            'What are you training when you get there?',
            'Going in with a plan this time?',
            'What weight did you use last time?',
          ],
          captionExamples: [
            'The small check that makes the next session easier.',
            'One less thing to guess once I get through the door.',
          ],
          soundMood: 'Current UK Commercial Music Library track that feels focused, understated and gym-native; never novelty or shock audio.',
          hashtags: ['gymtok', 'gymprogress', 'workoutplan', 'workoutapp'],
          rules: [
            'Always use the saved casual person-walking-to-a-car slide-one composition.',
            'Keep the title short, human and readable in one glance.',
            'Resolve the setup with one exact current Deadset feature screen.',
          ],
        },
        heartbreak_rebuild: {
          id: 'heartbreak_rebuild',
          label: 'Heartbreak to quiet rebuild',
          featureKey: 'muscle_diagram',
          hookExamples: [
            'How much did it hurt?',
            'What changed after that night?',
            'When did enough become enough?',
          ],
          captionExamples: [
            'Some moments change what you do next.',
            'No speech. Just a different decision from here.',
          ],
          proofOverlay: 'Enough.',
          soundMood: 'Current UK Commercial Music Library track tagged sad, sorrow, reflective or emotional; restrained rather than melodramatic.',
          hashtags: ['gymtok', 'gymmotivation', 'gymprogress', 'workoutapp'],
          rules: [
            'The first slide remains the saved car-led lifestyle image; the emotion comes from the title, not fake distress.',
            'The second slide is the exact Deadset muscle diagram with the payoff “Enough.”',
            'Never present a before-and-after body, customer result or claim that a breakup caused a physical transformation.',
          ],
        },
        villain_arc: {
          id: 'villain_arc',
          label: 'Controlled villain arc',
          featureKey: 'muscle_diagram',
          hookExamples: [
            'What started the villain arc?',
            'When did you stop explaining?',
            'What was the final warning?',
          ],
          captionExamples: [
            'That was the last time I needed convincing.',
            'Quiet decisions usually make the most noise later.',
          ],
          proofOverlay: 'Enough.',
          soundMood: 'Current UK Commercial Music Library track tagged powerful, dynamic, dark hip-hop, hard electronic or intense; tough without shock audio.',
          hashtags: ['gymtok', 'gymmotivation', 'gymprogress', 'workoutapp'],
          rules: [
            'The first slide remains the saved car-led lifestyle image and uses a controlled, confident title.',
            'The second slide is the exact Deadset muscle diagram with the payoff “Enough.”',
            'Never imply violence, revenge, harassment or a fabricated body transformation.',
          ],
        },
      },
      occasionalRotation: {
        lanes: ['heartbreak_rebuild', 'villain_arc'],
        targetEveryPosts: 6,
        minimumGapPosts: 4,
      },
      captionTreatment: 'TikTok Classic-style semi-bold white sans serif, pure white fill, clean 5px black outside stroke, subtle black shadow, centred safe-zone placement, no text box and no hollow or cinematic display type.',
      soundPolicy: [
        'Match the sound mood to the content lane; sad and villain-arc posts must not receive the same emotional treatment.',
        'For a Business Account, use only tracks eligible in TikTok’s Commercial Music Library for the United Kingdom at posting time.',
        'Direct photo posting can request TikTok recommended music but cannot name an exact track; store the mood brief and let TikTok add recommended music automatically.',
        'Never hard-code a trend name because availability, business eligibility and popularity change.',
      ],
      trendPolicy: [
        'Use TikTok Creative Centre UK as the source of truth for current hashtag and sound trends.',
        'Treat trends as a fit check, not a reason to force irrelevant audio or tags onto the post.',
        'Keep three to five specific hashtags and reject generic engagement-bait tags.',
      ],
      blockedHashtags: ['fyp', 'foryou', 'foryoupage', 'viral', 'trending', 'xyzbca'],
      learningMetrics: ['views', 'like_rate', 'comment_rate', 'share_rate', 'feature', 'content_lane', 'hook'],
    },
    features: {
      muscle_diagram: {
        label: 'Muscle diagram',
        truth: 'The exercise library highlights primary and secondary target muscles. It is not a body-transformation or strength-progress comparison.',
        stockDirection: 'candid gym mirror photo or lifter choosing an exercise',
        fallbackHook: 'Which muscle is this exercise actually training?',
        fallbackCaption: 'The screen I check before I commit to an exercise.',
        fallbackProofOverlay: 'Primary and secondary muscles, shown clearly',
      },
      training_heatmap: {
        label: 'Training heatmap',
        truth: 'Logged sessions build a visual consistency and volume heatmap.',
        stockDirection: 'person arriving at the gym or packing a gym bag',
        fallbackHook: 'Did I train consistently or just remember the good weeks?',
        fallbackCaption: 'My training history is much harder to argue with when I can see it.',
        fallbackProofOverlay: 'Logged sessions become a training heatmap',
      },
      pr_wall: {
        label: 'PR wall',
        truth: 'Logged personal records appear together in the app as a PR wall.',
        stockDirection: 'lifter after a difficult set or looking at the barbell',
        fallbackHook: 'The set was ugly. The number still counts.',
        fallbackCaption: 'Keeping every personal record in one place makes the hard sessions worth remembering.',
        fallbackProofOverlay: 'Logged personal records, together',
      },
      progression_board: {
        label: 'Progression board',
        truth: 'Logged training history helps the user see what load they used and choose what to use next.',
        stockDirection: 'lifter checking a phone between weighted sets',
        fallbackHook: 'What weight did I use last time?',
        fallbackCaption: 'One less thing to guess between sets.',
        fallbackProofOverlay: 'See the last load before choosing the next one',
      },
      workout_plan: {
        label: 'Workout plan',
        truth: 'Users can build or follow a structured weekly workout plan.',
        stockDirection: 'ordinary gym arrival, locker-room mirror or workout preparation',
        fallbackHook: 'Walking into the gym with no plan again?',
        fallbackCaption: 'A clear week makes starting the next session easier.',
        fallbackProofOverlay: 'A structured week, ready before the session',
      },
      live_logger: {
        label: 'Live workout logger',
        truth: 'Users record sets, reps and weights during a workout.',
        stockDirection: 'hands using a phone between sets beside real gym equipment',
        fallbackHook: 'If I do not log the set now, it never happened.',
        fallbackCaption: 'Sets, reps and weight recorded while the workout is still happening.',
        fallbackProofOverlay: 'Log the working set before the next one',
      },
    },
    claimsToAvoid: [
      'guaranteed gains', 'guaranteed muscle', 'body transformation', 'automatic transformation',
      'real user result', 'never plateau', 'world class strength',
    ],
    videoShape: [
      'Open on real creator-shot weighted gym motion in frame one; no static portrait or logo.',
      'Use a problem-first one-second hook without the brand name.',
      'Cut to a continuous real Deadset recording that directly proves the hook.',
      'For the weight-selection angle, show setup, goal, training days, session size, generated week and live logger.',
      'Return to the lifter for the final beat so the ending can loop into the opening.',
      'Music throughout by default; short native captions, no glossy end card.',
    ],
  },
  cast: {
    version: 'cast-2026-09-02.1',
    appSlug: 'cast',
    appName: 'Cast',
    category: 'fishing',
    positioning: 'Read the water, prove what is there and fish it together: bite intelligence, private-aware catch evidence, FishKey, logging and crews.',
    captionSuffix: 'Cast on the App Store.',
    defaultHashtags: ['fishingtok', 'ukfishing', 'angling', 'fishingapp'],
    hookVisualTemplate: {
      id: CAST_HOOK_VISUAL_TEMPLATE_ID,
      direction: 'A real, native-feeling fishing decision moment beside visible water: one angler casting, waiting, checking a rod or looking across the mark. Shoot from behind, over the shoulder or from a casual phone-like angle. Prefer dawn, dusk or naturally low light, slightly imperfect framing and clear fishing action. The image must create the question of whether this is the right time to fish; it must not look like a glossy outdoor advert.',
      searchQuery: 'angler casting fishing rod lake dusk vertical',
      requiredAltTermGroups: [
        ['fish', 'fishing', 'angler', 'fisherman', 'rod'],
        ['person', 'man', 'woman', 'people', 'angler', 'fisherman'],
        ['water', 'lake', 'river', 'sea', 'coast', 'shore', 'beach', 'bank'],
      ],
      captionStyle: 'TikTok Classic-style semi-bold white sans serif at a normal medium-heavy weight, clean 4-5px black outline, no box, no hollow lettering and no oversized cinematic title treatment.',
      variationRule: 'Vary the angler, water, weather, location, action and hook while preserving a clear real-world decision about whether and when to fish.',
      rejectionRule: 'Reject posed trophy shots, fish close-ups, empty landscapes, glossy outdoor advertising, catalogue-style walking shots, cinematic colour grading and any image without an angler, fishing gear and visible water.',
      gateLabel: 'angler-and-water',
    },
    creativeStrategy: {
      defaultLane: 'fishing_decision',
      lanes: {
        fishing_decision: {
          id: 'fishing_decision',
          label: 'Real fishing decision',
          hookExamples: [
            'Worth fishing this mark tonight?',
            'Would you cast here right now?',
            'What would you check before the first cast?',
          ],
          captionExamples: [
            'The decision before the first cast matters more than the scenic shot.',
            'I would rather read the conditions than guess the session.',
          ],
          soundMood: 'Current UK Commercial Music Library track that fits the field footage: calm or reflective for waiting, dynamic for action, never novelty or shock audio.',
          hashtags: ['fishingtok', 'ukfishing', 'angling', 'fishingapp'],
          rules: [
            'Open on a real angler, visible fishing gear and visible water.',
            'Choose the hook from the actual fishing decision and prove it with one exact Cast screen.',
            'Never expose an exact private mark or imply that conditions guarantee a catch.',
          ],
        },
      },
      captionTreatment: 'TikTok Classic-style semi-bold white sans serif, pure white fill, clean 5px black outside stroke, subtle black shadow, centred safe-zone placement, no text box and no hollow or cinematic display type.',
      soundPolicy: [
        'Match audio energy to the field moment: calm for waiting and observation, dynamic for casts, bites and catches.',
        'For a Business Account, use only tracks eligible in TikTok’s Commercial Music Library for the United Kingdom at posting time.',
        'Direct photo posting can request TikTok recommended music but cannot name an exact track; store the mood brief and let TikTok add recommended music automatically.',
        'Never hard-code a trend name because availability, business eligibility and popularity change.',
      ],
      trendPolicy: [
        'Use TikTok Creative Centre UK as the source of truth for current fishing hashtags and sounds.',
        'Prefer a relevant angling niche over a generic trend that weakens the hook.',
        'Keep three to five specific hashtags and reject generic engagement-bait tags.',
      ],
      blockedHashtags: ['fyp', 'foryou', 'foryoupage', 'viral', 'trending', 'xyzbca'],
      learningMetrics: ['views', 'like_rate', 'comment_rate', 'share_rate', 'feature', 'content_lane', 'hook'],
    },
    features: {
      bite_forecast: {
        label: 'Bite forecast',
        truth: 'CAST combines solunar windows, tide state, pressure trend and weather at the selected mark into one fishing score and exposes the underlying signals.',
        stockDirection: 'angler checking conditions by a lake, river or coast before fishing',
        fallbackHook: 'Worth going fishing tonight?',
        fallbackCaption: 'I check the live score and best fishing window before I waste the trip.',
        // The exact home capture already states the score, recommended window,
        // target species and tide. Extra text would cover the product proof.
        fallbackProofOverlay: '',
      },
      fishkey: {
        label: 'FishKey',
        truth: 'FishKey narrows species from observable field marks and works offline. A photo is a private reference; CAST does not claim automatic AI photo recognition.',
        stockDirection: 'angler safely holding or observing a real fish beside the water',
        fallbackHook: 'What fish did you actually catch?',
        fallbackCaption: 'Field marks make a better answer than a guess.',
        fallbackProofOverlay: 'Narrow the species from observable field marks',
      },
      catch_map: {
        label: 'Catch activity map',
        truth: 'Photo-backed catches can be shared with a public spot, stable approximate area or no location; private notes and exact times are excluded.',
        stockDirection: 'angler walking a bank or looking across a fishing mark',
        fallbackHook: 'Would you share this spot or keep it quiet?',
        fallbackCaption: 'Share the catch without giving away more location than you choose.',
        fallbackProofOverlay: 'Public, approximate or no location—you choose',
      },
      catch_log: {
        label: 'Catch logbook',
        truth: 'A catch can store species, size, rarity, photo, mark, weather, tide, pressure and session context.',
        stockDirection: 'hands measuring or photographing a catch responsibly',
        fallbackHook: 'The catch details I always forget by next week',
        fallbackCaption: 'Species, conditions and session context saved while they are still fresh.',
        fallbackProofOverlay: 'The full catch, not just the photo',
      },
      records: {
        label: 'Records and trophy room',
        truth: 'Logged catches become personal records, patterns and trip summaries.',
        stockDirection: 'angler looking back at catch photos or finishing a session',
        fallbackHook: 'The session that quietly became a personal best',
        fallbackCaption: 'The catches I log become records and trip patterns I can look back on.',
        fallbackProofOverlay: 'Personal records and trip patterns from your log',
      },
      crew: {
        label: 'Crew Dock',
        truth: 'Crews use invite links, CAST IDs, requests, posts, challenges and live sessions with owner-controlled audiences.',
        stockDirection: 'small group of friends fishing together at a real mark',
        fallbackHook: 'The group chat finally has a fishing plan',
        fallbackCaption: 'One place for the crew, the challenge and the next live session.',
        fallbackProofOverlay: 'Plan and fish together in Crew Dock',
      },
    },
    claimsToAvoid: [
      'guaranteed catch', 'guaranteed catches', 'guaranteed fish', 'exact secret spots',
      'automatic fish identification', 'ai identifies every fish', 'every fish', 'every water',
      'live moderation', 'always accurate',
    ],
    videoShape: [
      'Open with immediate real fishing action, a weather decision, a cast, line tension, a catch or hands using the product in the field.',
      'Use one angler problem in the first second; no scenic dead air or logo opening.',
      'Show one continuous real CAST flow that directly resolves the problem.',
      'Keep the exact mark private unless the owner deliberately chooses otherwise.',
      'Do not imply FishKey is automatic AI photo recognition or that a forecast guarantees fish.',
      'End on continuing field action or the next decision; no long App Store card.',
    ],
  },
};

export function getCreativePlaybook(slug: string): CreativePlaybook | null {
  return CREATIVE_PLAYBOOKS[slug] ?? null;
}

export interface PlannedContentLane {
  lane: CreativeContentLane;
  reason: string;
}

function storedContentLane(manifest: Record<string, unknown> | undefined): string | null {
  const stored = manifest?.content_lane;
  if (!stored || typeof stored !== 'object' || !('id' in stored)) return null;
  return typeof stored.id === 'string' ? stored.id : null;
}

/**
 * Keeps occasional narrative formats genuinely occasional. The recent
 * artifact list is newest-first, so the position of the latest special lane
 * is also the number of newer posts since it. No wall-clock randomness is
 * involved, which makes scheduled batches predictable and testable.
 */
export function planCarouselContentLanes(
  playbook: CreativePlaybook,
  recent: Array<{ asset_manifest: Record<string, unknown> }>,
  count: number,
  allowedFeatures: string[] = Object.keys(playbook.features),
): PlannedContentLane[] {
  const strategy = playbook.creativeStrategy;
  const defaultLane = strategy.lanes[strategy.defaultLane];
  if (!defaultLane) throw new Error(`${playbook.appName} creative strategy has no default lane`);
  const plan = Array.from({ length: Math.max(0, count) }, () => ({
    lane: defaultLane,
    reason: 'default native content lane',
  }));
  const rotation = strategy.occasionalRotation;
  if (!rotation || plan.length === 0) return plan;

  const eligibleLaneIds = rotation.lanes.filter((id) => {
    const lane = strategy.lanes[id];
    return lane && (!lane.featureKey || allowedFeatures.includes(lane.featureKey));
  });
  if (eligibleLaneIds.length === 0) return plan;

  const occasionalIds = new Set(rotation.lanes);
  const recentLaneIds = recent.map((artifact) => storedContentLane(artifact.asset_manifest));
  const latestOccasionalIndex = recentLaneIds.findIndex((id) => Boolean(id && occasionalIds.has(id)));
  const postsSinceOccasional = latestOccasionalIndex === -1 ? recent.length : latestOccasionalIndex;
  const dueAfter = Math.max(rotation.minimumGapPosts, rotation.targetEveryPosts - 1);
  if (postsSinceOccasional < dueAfter) return plan;

  const priorOccasionalCount = recentLaneIds.filter((id) => Boolean(id && occasionalIds.has(id))).length;
  const nextLaneId = eligibleLaneIds[priorOccasionalCount % eligibleLaneIds.length]!;
  const nextLane = strategy.lanes[nextLaneId]!;
  plan[0] = {
    lane: nextLane,
    reason: `occasional rotation due after ${postsSinceOccasional} newer posts; target cadence is about one in ${rotation.targetEveryPosts}`,
  };
  return plan;
}

/** Keeps model-written social copy human while enforcing one clean store CTA. */
export function normalizeCaption(caption: string, suffix: string): string {
  const appName = suffix.split(/\s+/)[0] ?? '';
  const legacySuffix = new RegExp(`${appName}\\s+on\\s+(?:the\\s+)?app\\s*store[.!?]*$`, 'i');
  const cleaned = caption
    .trim()
    .replace(/^[\s'"“”‘’]+|[\s'"“”‘’]+$/g, '')
    .replace(legacySuffix, '')
    .trim()
    .replace(/\s+/g, ' ');
  const sentence = cleaned || `Try ${appName}`;
  const punctuation = /[.!?]$/.test(sentence) ? '' : '.';
  return `${sentence}${punctuation} ${suffix}`.slice(0, 2200);
}

export function featureSpecs(playbook: CreativePlaybook) {
  return Object.entries(playbook.features).map(([key, feature]) => ({ key, ...feature }));
}

export function productTruth(playbook: CreativePlaybook): string {
  const features = Object.entries(playbook.features)
    .map(([key, feature]) => `- ${key}: ${feature.truth}`)
    .join('\n');
  return [
    `Positioning: ${playbook.positioning}`,
    'Feature truth — mention only these exact capabilities:',
    features,
    `Claims to avoid: ${playbook.claimsToAvoid.join('; ')}.`,
    `Required video shape:\n- ${playbook.videoShape.join('\n- ')}`,
  ].join('\n');
}

export function photoSystem(playbook: CreativePlaybook): string {
  const featureTruth = Object.entries(playbook.features)
    .map(([key, feature]) => `- ${key}: ${feature.truth} Suitable real-photo setup: ${playbook.hookVisualTemplate?.direction ?? feature.stockDirection}.`)
    .join('\n');
  const hookTemplate = playbook.hookVisualTemplate
    ? `\nMandatory slide-one visual template (${playbook.hookVisualTemplate.id}):\n- ${playbook.hookVisualTemplate.direction}\n- Caption treatment: ${playbook.hookVisualTemplate.captionStyle}\n- This composition is required for every ${playbook.appName} photo carousel. ${playbook.hookVisualTemplate.variationRule}\n- ${playbook.hookVisualTemplate.rejectionRule}\n`
    : '';
  const contentLanes = Object.values(playbook.creativeStrategy.lanes)
    .map((lane) => [
      `- ${lane.id} (${lane.label})${lane.featureKey ? `; required feature: ${lane.featureKey}` : ''}`,
      `  Hook inspiration: ${lane.hookExamples.join(' | ')}`,
      `  Caption inspiration: ${lane.captionExamples.join(' | ')}`,
      lane.proofOverlay ? `  Exact second-slide payoff: ${lane.proofOverlay}` : null,
      `  Sound mood: ${lane.soundMood}`,
      `  Rules: ${lane.rules.join(' ')}`,
    ].filter(Boolean).join('\n'))
    .join('\n');
  return `You create original two-slide TikTok photo carousel drafts for ${playbook.appName.toUpperCase()}.

Content grammar:
1. Slide one is a candid, believable real-life ${playbook.category} photograph with one short relatable question, message or setup in native TikTok text.
2. Slide two is an exact current screenshot of one real ${playbook.appName} feature that answers the setup.

${featureTruth}
${hookTemplate}

Content lanes:
${contentLanes}

Sound and trend policy:
- ${playbook.creativeStrategy.soundPolicy.join('\n- ')}
- ${playbook.creativeStrategy.trendPolicy.join('\n- ')}

Rules:
- One carousel makes one promise to one audience. The exact app screen is the proof.
- The hook is entertaining native social copy, not an ad headline: under 70 characters and clear in one second.
- Use creator-owned or explicitly licensed real imagery. Never request an AI person, celebrity, copied social post or Pinterest download. Pinterest is mood-reference only.
- The payoff must name one exact feature key above. Never fabricate UI, users, statistics, results, catches, strength gains or testimonials.
- Avoid these claims: ${playbook.claimsToAvoid.join('; ')}.
- No logo card, App Store badge, watermark or promotional copy burned into either image.
- Caption: one natural sentence, then "${playbook.captionSuffix}". Use 3-5 relevant lowercase hashtags.
- On-image caption treatment is mandatory: ${playbook.creativeStrategy.captionTreatment}
- Do not use these generic engagement-bait hashtags: ${playbook.creativeStrategy.blockedHashtags.map((tag) => `#${tag}`).join(' ')}.
- Every idea must use a different hook situation and, when possible, a different feature.

Reply with JSON only:
{"ideas":[{
  "hook":"...","caption":"... ${playbook.captionSuffix}","hashtags":${JSON.stringify(playbook.defaultHashtags)},
  "shot_notes":"two 1080x1920 stills; normal TikTok Classic-style bold white text with a clean black outline; exact app capture",
  "audience":"...","single_promise":"...","hook_hypothesis":"...","proof_shown":"...",
  "creative_lane":"one exact content lane id from the list","sound_brief":"describe the required mood, not a hard-coded track name",
  "feature":"one exact feature key from the list",
  "slides":[
    {"role":"hook","overlay":"...","asset_query":"...","source_requirement":"licensed real photo; record source and licence"},
    {"role":"feature_proof","overlay":"...","app_asset_key":"same exact feature key","source_requirement":"exact current ${playbook.appName} screenshot; no rebuilt UI"}
  ]
}]}`;
}
