/** Curated, original copy: no model calls, synthetic imagery or competitor claims. */
export const CAST_EDITORIAL_FORMAT = 'cast_editorial_carousel';
export const CAST_EDITORIAL_VERSION = 'cast-editorial-2026-09-10';
export const CAST_REFERENCE_URLS = [
  'https://www.tiktok.com/@r1pple8/photo/7683784451708456199',
  'https://www.tiktok.com/@r1pple8/photo/7683655444849511698',
  'https://www.tiktok.com/@r1pple8/photo/7683475654402460935',
];
export interface EditorialSlide { role: 'hook' | 'editorial'; overlay: string; body: string; kicker: string }
export interface CastEditorialConcept {
  id: string; hook: string; caption: string; promotional: boolean;
  items: Array<[heading: string, body: string]>;
}
export const CAST_EDITORIAL_CONCEPTS: CastEditorialConcept[] = [
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
  { id: 'trip-debrief', hook: '5 questions worth asking on the way home', promotional: false,
    caption: 'A two-minute debrief gives the next trip a starting point. Keep the answers while they are fresh.',
    items: [['5 · What did you expect?', 'Write down the plan you started with.'], ['4 · What actually happened?', 'Keep the observations separate from the guesses.'], ['3 · What did you change?', 'Record the setup and when you changed it.'], ['2 · What is worth repeating?', 'Keep a note of the decisions you want to try again.'], ['1 · What is the next question?', 'Leave yourself one thing to test next session.']] },
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

export function editorialSlides(concept: CastEditorialConcept): EditorialSlide[] {
  return [{ role: 'hook', overlay: concept.hook, body: '', kicker: 'Swipe through →' },
    ...concept.items.map(([overlay, body], i) => ({ role: 'editorial' as const, overlay, body,
      kicker: `${i + 2} / 6` }))];
}

/** Never churn out near-duplicate hooks when the finite, curated bank is exhausted. */
export function planCastEditorial(recent: Array<{ hook?: string | null; asset_manifest: Record<string, unknown> }>, count: number): CastEditorialConcept[] {
  const used = new Set(recent.map(r => r.asset_manifest.editorial_id));
  const usedHooks = new Set(recent.map(r => r.hook?.toLowerCase()));
  const history = recent.filter(r => r.asset_manifest.format === CAST_EDITORIAL_FORMAT);
  let sincePromo = history.findIndex(r => r.asset_manifest.promotional === true);
  if (sincePromo < 0) sincePromo = history.length;
  const result: CastEditorialConcept[] = [];
  for (let i = 0; i < count; i++) {
    const promotional = sincePromo >= 4;
    const next = CAST_EDITORIAL_CONCEPTS.find(c => c.promotional === promotional && !used.has(c.id) && !usedHooks.has(c.hook.toLowerCase()));
    if (!next) break;
    result.push(next); used.add(next.id); sincePromo = next.promotional ? 0 : sincePromo + 1;
  }
  return result;
}

export function castEditorialHtml(input: { imageUrl: string; overlay: string; editorial: { body: string; kicker: string }; role: 'hook' | 'feature' }): string {
  const esc = (s: string) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  if (!input.overlay.trim() || input.overlay.length > 90 || input.editorial.body.length > 120) throw new Error('Cast editorial copy exceeds its readable length budget.');
  const hook = input.role === 'hook';
  const badge = hook ? input.editorial.kicker : input.overlay.match(/^[1-5] · /)?.[0].trim().replace(' ·', '') ?? input.editorial.kicker;
  const heading = hook ? input.overlay : input.overlay.replace(/^[1-5] · /, '');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box}html,body{margin:0;width:1080px;height:1920px;overflow:hidden;background:#0d191c;color:white;font-family:Arial,Helvetica,sans-serif}
.photo{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center}
.shade{position:absolute;inset:0;background:linear-gradient(180deg,#0002,#0003 35%,#0006 70%,#0002)}
.copy{position:absolute;left:86px;width:778px;text-align:center;font-weight:700;line-height:1.12;-webkit-text-stroke:5px #000;paint-order:stroke fill;text-shadow:0 3px 6px #0008;overflow-wrap:break-word}
.head{top:${hook ? 570 : 540}px;font-size:${hook ? 76 : 74}px;max-height:260px;margin:0}.body{top:850px;font-size:58px;max-height:260px;margin:0}
.kicker{position:absolute;left:${hook ? 86 : 379}px;top:${hook ? 970 : 350}px;width:${hook ? 778 : 192}px;height:${hook ? 50 : 112}px;display:flex;align-items:center;justify-content:center;font-size:${hook ? 34 : 68}px;font-weight:700;background:${hook ? 'transparent' : '#38bdb3'};color:${hook ? '#fff' : '#082522'};border-radius:14px;text-shadow:${hook ? '0 2px 5px #000' : 'none'}}
.brand{position:absolute;left:86px;top:1230px;font-size:28px;font-weight:700;letter-spacing:3px;text-shadow:0 2px 4px #000}
</style></head><body><img class="photo" src="${esc(input.imageUrl)}"><div class="shade"></div><div class="kicker">${esc(badge)}</div><h1 class="copy head">${esc(heading)}</h1>${input.editorial.body ? `<p class="copy body">${esc(input.editorial.body)}</p>` : ''}<div class="brand">CAST</div></body></html>`;
}
