/** Curated, original copy: no model calls, synthetic imagery or competitor claims. */
export const CAST_EDITORIAL_FORMAT = 'cast_editorial_carousel';
export const CAST_EDITORIAL_VERSION = 'cast-editorial-2026-09-12-varied-bank';
export const CAST_REFERENCE_URLS = [
  'https://www.tiktok.com/@r1pple8/photo/7683784451708456199',
  'https://www.tiktok.com/@r1pple8/photo/7683655444849511698',
  'https://www.tiktok.com/@r1pple8/photo/7683475654402460935',
];
export interface EditorialSlide { photo_id?: number; role: 'hook' | 'editorial'; overlay: string; body: string; kicker: string }
export interface CastEditorialConcept {
  id: string; hook: string; caption: string; promotional: boolean;
  items: Array<[heading: string, body: string]>;
}
const CURATED_CONCEPTS: CastEditorialConcept[] = [
  { id: 'notes-tier-list', hook: 'Fishing notes tier list', promotional: true,
    caption: 'Our ranking of fishing notes by how much context they keep. What would you move up a tier?',
    items: [['D · “Caught one”', 'A memory, but almost nothing to compare.'], ['C · Photo only', 'You can see the fish. The setup is still missing.'], ['B · Add time and species', 'A clearer record of what happened and when.'], ['A · Add the setup', 'Lure or bait, depth and retrieve. Record what you used.'], ['S · Keep the context', 'Keep the catch and conditions together in Cast.']] },
  { id: 'memory-vs-record', hook: 'What you remember vs what you recorded', promotional: true,
    caption: 'Memory fills in the gaps. A short catch record gives you something concrete to check next time.',
    items: [['“Some time after lunch”', 'Record the catch time while it is fresh.'], ['“That lure worked”', 'Note the lure and how you retrieved it.'], ['“It was about this big”', 'Save the measurement you actually took.'], ['“The usual spot”', 'Keep the exact location private when appropriate.'], ['A record you can check', 'Keep the catch and conditions together in Cast.']] },
  { id: 'one-trip-five-decisions', hook: 'One fishing trip. Five decisions.', promotional: true,
    caption: 'A useful session starts with a few deliberate choices. Keep a record so you can compare what happened.',
    items: [['Choose your water', 'Check access and local restrictions before you travel.'], ['Choose your first setup', 'Start with tackle you know how to use.'], ['Choose one change', 'Adjust one thing, then pay attention to what happens.'], ['Choose what to record', 'Time, setup, conditions and the measured catch.'], ['Choose what to share', 'Keep control of location details in Cast.']] },
  { id: 'notes-ranked', hook: 'Fishing notes, ranked from vague to useful', promotional: false,
    caption: 'A catch photo is a memory. A few details make it something you can learn from. Which detail do you always forget?',
    items: [['5 · “Caught one”', 'Nice memory. Not much to compare next time.'], ['4 · Add the species', 'Now you know what the session produced.'], ['3 · Add the time', 'Record when it happened, not when you posted it.'], ['2 · Add the setup', 'Lure, depth and retrieve. Write down what you actually used.'], ['1 · Add the conditions', 'Keep the whole picture together. Blank sessions count too.']] },
  { id: 'before-buying', hook: '5 things to check before buying another lure', promotional: false,
    caption: 'The tackle box can wait. Work through the setup you already have before adding more to it.',
    items: [['5 · The line', 'Look for fraying or damage near the business end.'], ['4 · The knot', 'Check the connection before the next cast.'], ['3 · The hook', 'Look for damage and corrosion.'], ['2 · The retrieve', 'Change one thing at a time so you know what changed.'], ['1 · Your notes', 'What did you actually try here last time?']] },
  { id: 'private-mark', hook: '5 ways a catch photo gives away your spot', promotional: false,
    caption: 'Share the fish. Choose how much of the location goes with it. Check the whole post before you send it.',
    items: [['5 · The caption', 'A water name can reveal more than the photo.'], ['4 · The location tag', 'Check the location attached to the post.'], ['3 · The background', 'Signs, bridges and buildings can identify a mark.'], ['2 · The map screenshot', 'Crop out pins and exact coordinates before sharing.'], ['1 · The audience', 'Decide who gets the location before hitting share.']] },
  { id: 'blank-session', hook: 'A blank session still gives you 5 useful notes', promotional: false,
    caption: 'Zero catches is still a session. Keep a short record of what you tried, then make the next decision with more context.',
    items: [['5 · Where you tried', 'Keep the exact mark in your private notes.'], ['4 · Time on the water', 'Write down the start and finish.'], ['3 · The conditions', 'Record what you observed, not what you expected.'], ['2 · What you changed', 'A lure change? A different depth? Keep the sequence.'], ['1 · What to try next', 'Leave yourself one specific question for the next trip.']] },
  { id: 'cast-catch-context', hook: 'The catch photo is only half the story', promotional: true,
    caption: 'Cast keeps the species, photo and session context together. A better record for your next trip. Cast on the App Store.',
    items: [['The fish', 'Start with the species and a photo.'], ['The size', 'Record the size you measured.'], ['The conditions', 'Save weather, tide and pressure with the catch.'], ['The session', 'Keep the mark and session context together.'], ['The next trip', 'Look back at your own record in Cast.']] },
  { id: 'session-checklist', hook: '5 checks before the first cast', promotional: false,
    caption: 'A quick setup check beats finding the problem halfway through the session. Save this for your next trip.',
    items: [['5 · Line condition', 'Check the working end for wear.'], ['4 · Knot connection', 'Make sure the tackle is attached securely.'], ['3 · Tackle condition', 'Replace damaged components before fishing.'], ['2 · Space around you', 'Look behind you before casting.'], ['1 · A simple plan', 'Pick what you want to try first. Change one thing at a time.']] },
  { id: 'trip-debrief', hook: '5 fishing details to jot down before heading home', promotional: false,
    caption: 'You remember the fish. Will you remember the depth, retrieve and time? Save five quick notes before you pack away.',
    items: [['5 · Where were the bites?', 'Note the mark and depth. No bites? Record that too.'], ['4 · When did it happen?', 'Log the bite time, not just the hours you fished.'], ['3 · What were you using?', 'Bait or lure, rig and retrieve. Keep it specific.'], ['2 · What did you change?', 'Note when you swapped lure, depth or retrieve.'], ['1 · What will you try next?', 'Pick one change for your next visit to that mark.']] },
  { id: 'photo-checklist', hook: '5 details to save with your catch photo', promotional: false,
    caption: 'Future you will forget the details. Add a short note while the session is fresh.',
    items: [['5 · Species', 'Record the identification you can support.'], ['4 · Measurement', 'Keep the size you measured, not a guess.'], ['3 · Time', 'Save when the catch happened.'], ['2 · Setup', 'Note the lure or bait and how you fished it.'], ['1 · Context', 'Add the conditions and a private note about the mark.']] },
  { id: 'one-change', hook: 'Changing everything makes a session harder to read', promotional: false,
    caption: 'A simple record helps you separate what changed from what you merely remember. No promise of fish, just a clearer session.',
    items: [['Start with a baseline', 'Write down the setup you begin with.'], ['Pick one change', 'Try a different retrieve, lure or depth.'], ['Record the time', 'Keep track of when you made the change.'], ['Note the result', 'Bites, catches or no response. Record what happened.'], ['Keep the context', 'Conditions change too. A single session is not proof.']] },
  { id: 'cast-location-choice', hook: 'Share a catch without sharing every detail', promotional: true,
    caption: 'Cast lets you choose a public spot, approximate area or no location for a shared catch. Cast on the App Store.',
    items: [['The catch', 'Choose the photo and the details you want to share.'], ['A public spot', 'Use this when you want the location visible.'], ['An approximate area', 'Share a broader area instead of an exact mark.'], ['No location', 'Keep the location out of the shared catch.'], ['Your choice', 'Check the audience and location before sharing in Cast.']] },
];

export const CAST_STORE_CTA = 'Find Cast Fishing Companion on the App Store.';
const CAST_PAYOFFS: Record<string, string> = {
  'notes-tier-list': 'Keep catch conditions together in Cast.',
  'memory-vs-record': 'Look back at your catch records in Cast.',
  'one-trip-five-decisions': 'Choose how much location you share in Cast.',
  'notes-ranked': 'Keep your catch conditions together in Cast.',
  'before-buying': 'Check your past catch records in Cast.',
  'private-mark': 'Choose how much location you share in Cast.',
  'blank-session': 'Use your catch history in Cast to plan your next trip.',
  'cast-catch-context': 'Look back at your own catch records in Cast.',
  'session-checklist': 'Keep your catch history in Cast for the next trip.',
  'trip-debrief': 'Look back at your catch records in Cast.',
  'photo-checklist': 'Save your catch and conditions in Cast.',
  'one-change': 'Keep catch conditions together in Cast.',
  'cast-location-choice': 'Choose a public, approximate or hidden location in Cast.',
};
/** Every post earns attention with advice and ends with a truthful product action. */
export const CAST_EDITORIAL_CONCEPTS: CastEditorialConcept[] = CURATED_CONCEPTS.map(concept => ({
  ...concept, promotional: true,
  caption: /app store/i.test(concept.caption) ? concept.caption : `${concept.caption} Keep your catch records in Cast. ${CAST_STORE_CTA}`,
  items: concept.items.map((item, index) => index === 4 ? [item[0], `${CAST_PAYOFFS[concept.id]}\n${CAST_STORE_CTA}`] : item),
}));

export function editorialSlides(concept: CastEditorialConcept): EditorialSlide[] {
  return [{ role: 'hook', overlay: concept.hook, body: '', kicker: 'Swipe through →' },
    ...concept.items.map(([overlay, body], i) => ({ role: 'editorial' as const, overlay, body,
      kicker: `${i + 2} / 6` }))];
}

/** Never churn out near-duplicate hooks when the finite, curated bank is exhausted. */
export function planCastEditorial(recent: Array<{ hook?: string | null; asset_manifest: Record<string, unknown> }>, count: number): CastEditorialConcept[] {
  const used = new Set(recent.map(r => r.asset_manifest.editorial_id));
  const usedHooks = new Set(recent.map(r => r.hook?.toLowerCase()));
  const result: CastEditorialConcept[] = [];
  for (let i = 0; i < count; i++) {
    const next = CAST_EDITORIAL_CONCEPTS.find(c => !used.has(c.id) && !usedHooks.has(c.hook.toLowerCase()));
    if (!next) break;
    result.push(next); used.add(next.id);
  }
  return result;
}

export function castEditorialHtml(input: { imageUrl: string; overlay: string; editorial: { body: string; kicker: string }; role: 'hook' | 'feature' }): string {
  const esc = (s: string) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  if (!input.overlay.trim() || input.overlay.length > 90 || input.editorial.body.length > 120) throw new Error('Cast editorial copy exceeds its readable length budget.');
  const hook = input.role === 'hook';
  const heading = input.overlay.replace(/^([1-5]) · /, '$1. ');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box}html,body{margin:0;width:1080px;height:1920px;overflow:hidden;background:#0d191c;color:white;font-family:Arial,Helvetica,sans-serif}
.photo{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center}
.shade{position:absolute;inset:0;background:linear-gradient(180deg,transparent 8%,#0006 24%,#0006 46%,transparent 72%)}
.copy{position:absolute;left:86px;width:778px;text-align:center;font-weight:700;line-height:1.12;-webkit-text-stroke:5px #000;paint-order:stroke fill;text-shadow:0 3px 6px #0008;overflow-wrap:break-word}
.head{top:${hook ? 375 : 455}px;font-size:68px;max-height:260px;margin:0}.body{top:630px;font-size:53px;line-height:1.24;white-space:pre-line;max-height:340px;margin:0}
</style></head><body><img class="photo" src="${esc(input.imageUrl)}"><div class="shade"></div><h1 class="copy head">${esc(heading)}</h1>${input.editorial.body ? `<p class="copy body">${esc(input.editorial.body)}</p>` : ''}</body></html>`;
}

/** Search context is a sourcing filter, never a substitute for final pixel review. */
export function castPhotoDirection(slide: EditorialSlide, index: number): { query: string; terms: string[][] } {
  const heading = slide.overlay.toLowerCase();
  if (index > 0 && /fish|species|size|measurement|catch/.test(heading))
    return { query: 'fish catch landing net', terms: [['trout', 'carp', 'bass', 'holding a fish', 'fish in', 'caught fish']] };
  if (index > 0 && /setup|line|knot|hook|tackle|using|retrieve|change/.test(heading))
    return { query: 'fishing rod reel tackle', terms: [['fishing', 'rod', 'reel', 'tackle', 'lure']] };
  if (index > 0 && /time|when|timing/.test(heading))
    return { query: 'fishing sunset water', terms: [['fishing', 'angler', 'fisherman', 'rod'], ['sunset', 'dusk', 'dawn', 'evening', 'sunrise']] };
  return { query: index % 2 ? 'angler river fishing' : 'fishing lake shore', terms: [['fishing', 'angler', 'fisherman', 'rod'], ['water', 'lake', 'river', 'sea', 'shore', 'coast']] };
}
