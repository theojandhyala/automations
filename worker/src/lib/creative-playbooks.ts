export interface CreativeFeature {
  label: string;
  truth: string;
  stockDirection: string;
}

export interface CreativePlaybook {
  version: string;
  appSlug: 'deadset' | 'cast';
  appName: string;
  category: 'fitness' | 'fishing';
  positioning: string;
  captionSuffix: string;
  defaultHashtags: string[];
  features: Record<string, CreativeFeature>;
  claimsToAvoid: string[];
  videoShape: string[];
}

export const CREATIVE_PLAYBOOKS: Record<string, CreativePlaybook> = {
  deadset: {
    version: 'deadset-2026-08-31.1',
    appSlug: 'deadset',
    appName: 'Deadset',
    category: 'fitness',
    positioning: 'A gym planning and workout-tracking app that turns a plan, logged sets and training history into a clearer next workout.',
    captionSuffix: 'deadset on appstore',
    defaultHashtags: ['gymtok', 'gymprogress', 'workoutplan', 'workoutapp'],
    features: {
      muscle_diagram: {
        label: 'Muscle diagram',
        truth: 'The exercise library highlights primary and secondary target muscles. It is not a body-transformation or strength-progress comparison.',
        stockDirection: 'candid gym mirror photo or lifter choosing an exercise',
      },
      training_heatmap: {
        label: 'Training heatmap',
        truth: 'Logged sessions build a visual consistency and volume heatmap.',
        stockDirection: 'person arriving at the gym or packing a gym bag',
      },
      pr_wall: {
        label: 'PR wall',
        truth: 'Logged personal records appear together in the app as a PR wall.',
        stockDirection: 'lifter after a difficult set or looking at the barbell',
      },
      progression_board: {
        label: 'Progression board',
        truth: 'Logged training history helps the user see what load they used and choose what to use next.',
        stockDirection: 'lifter checking a phone between weighted sets',
      },
      workout_plan: {
        label: 'Workout plan',
        truth: 'Users can build or follow a structured weekly workout plan.',
        stockDirection: 'ordinary gym arrival, locker-room mirror or workout preparation',
      },
      live_logger: {
        label: 'Live workout logger',
        truth: 'Users record sets, reps and weights during a workout.',
        stockDirection: 'hands using a phone between sets beside real gym equipment',
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
    version: 'cast-2026-08-31.1',
    appSlug: 'cast',
    appName: 'Cast',
    category: 'fishing',
    positioning: 'Read the water, prove what is there and fish it together: bite intelligence, private-aware catch evidence, FishKey, logging and crews.',
    captionSuffix: 'cast on appstore',
    defaultHashtags: ['fishingtok', 'ukfishing', 'angling', 'fishingapp'],
    features: {
      bite_forecast: {
        label: 'Bite forecast',
        truth: 'CAST combines solunar windows, tide state, pressure trend and weather at the selected mark into one fishing score and exposes the underlying signals.',
        stockDirection: 'angler checking conditions by a lake, river or coast before fishing',
      },
      fishkey: {
        label: 'FishKey',
        truth: 'FishKey narrows species from observable field marks and works offline. A photo is a private reference; CAST does not claim automatic AI photo recognition.',
        stockDirection: 'angler safely holding or observing a real fish beside the water',
      },
      catch_map: {
        label: 'Catch activity map',
        truth: 'Photo-backed catches can be shared with a public spot, stable approximate area or no location; private notes and exact times are excluded.',
        stockDirection: 'angler walking a bank or looking across a fishing mark',
      },
      catch_log: {
        label: 'Catch logbook',
        truth: 'A catch can store species, size, rarity, photo, mark, weather, tide, pressure and session context.',
        stockDirection: 'hands measuring or photographing a catch responsibly',
      },
      records: {
        label: 'Records and trophy room',
        truth: 'Logged catches become personal records, patterns and trip summaries.',
        stockDirection: 'angler looking back at catch photos or finishing a session',
      },
      crew: {
        label: 'Crew Dock',
        truth: 'Crews use invite links, CAST IDs, requests, posts, challenges and live sessions with owner-controlled audiences.',
        stockDirection: 'small group of friends fishing together at a real mark',
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
    .map(([key, feature]) => `- ${key}: ${feature.truth} Suitable real-photo setup: ${feature.stockDirection}.`)
    .join('\n');
  return `You create original two-slide TikTok photo carousel drafts for ${playbook.appName.toUpperCase()}.

Content grammar:
1. Slide one is a candid, believable real-life ${playbook.category} photograph with one short relatable question, message or setup in native TikTok text.
2. Slide two is an exact current screenshot of one real ${playbook.appName} feature that answers the setup.

${featureTruth}

Rules:
- One carousel makes one promise to one audience. The exact app screen is the proof.
- The hook is entertaining native social copy, not an ad headline: under 70 characters and clear in one second.
- Use creator-owned or explicitly licensed real imagery. Never request an AI person, celebrity, copied social post or Pinterest download. Pinterest is mood-reference only.
- The payoff must name one exact feature key above. Never fabricate UI, users, statistics, results, catches, strength gains or testimonials.
- Avoid these claims: ${playbook.claimsToAvoid.join('; ')}.
- No logo card, App Store badge, watermark or promotional copy burned into either image.
- Caption: one natural sentence, then "${playbook.captionSuffix}". Use 3-5 relevant lowercase hashtags.
- Every idea must use a different hook situation and, when possible, a different feature.

Reply with JSON only:
{"ideas":[{
  "hook":"...","caption":"... ${playbook.captionSuffix}","hashtags":${JSON.stringify(playbook.defaultHashtags)},
  "shot_notes":"two 1080x1920 stills; native bold white text with black outline; exact app capture",
  "audience":"...","single_promise":"...","hook_hypothesis":"...","proof_shown":"...",
  "feature":"one exact feature key from the list",
  "slides":[
    {"role":"hook","overlay":"...","asset_query":"...","source_requirement":"licensed real photo; record source and licence"},
    {"role":"feature_proof","overlay":"...","app_asset_key":"same exact feature key","source_requirement":"exact current ${playbook.appName} screenshot; no rebuilt UI"}
  ]
}]}`;
}
