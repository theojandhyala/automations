/** Owner's 10 September reset, backed by the saved Stronger audit. */
export const CREATIVE_DIRECTION_VERSION = 'cast-deadset-2026-09-12-candid-person-v9';

export const CREATIVE_DIRECTION = `Creative director standard (${CREATIVE_DIRECTION_VERSION}):
For a two-slide promotion: one recognisable human situation, one short setup, one visible product answer.
For Cast six-slide editorial: a concrete useful hook followed by five clear useful items. Every final slide must connect its last useful item to a truthful Cast benefit and an App Store call to action. An actual app screenshot is optional for this advice format; naming and promoting Cast is mandatory. Each item can include a short explanatory sentence.
Deadset reference: @strongermobile, inspected in docs/strongermobile-creative-audit-2026-09-10.md.
The observed grammar is ordinary photo -> short conversation -> app evidence. Use original wording.
Owner's latest mix: FIVE posts per account per London day, in the 10:00, 12:00, 14:00, 16:00 and 18:30 slots. Rotate structures, not merely opening words. Deadset rotates relatable product answers, habit tier lists, mistake/fix, short tutorials and occasional long rules posts. The new Week/Month/Year/All time calendar is UNRELEASED: do not promote calendar/heatmap until a verified public App Store release includes it. Use another shipped-feature story in that daily slot meanwhile. Cast rotates tier lists of useful fishing habits, mistake/fix stories and practical field checklists, always ending in a truthful Cast benefit. New inspected reference: @zeno.app/photo/7673262585545837831 — casual gym opener followed by a tier-list board. Borrow the concise ranking grammar for original useful habits; never invent competitor tests, rankings or first-person app endorsements. Tier-list artwork is authored and reviewed as an explicit format experiment; do not pretend an ordinary two-slide renderer produced a new board layout. Retain current supported format and exact-media/source gates.
Latest Deadset opener correction: lead with an engaging candid photo of a stylish real person in an ordinary moment, preferably getting into/beside a dark car, like the owner-described beanie/black-car example (car make unverified and not required). Vary people, outfits and candid car/street moments. The first slide should feel like a real personal camera-roll upload, never an AI image, staged campaign, scripted pose, empty-car advert or shoe/equipment-only filler. Verify creator/source and reuse rights separately; appearance alone does not prove authenticity or that the person uses Deadset. Inspect the photo at phone size before adding the short centred hook, keep the face unobstructed, then inspect the final export. This supersedes the prior gym-floor opener default. For authored long posts, use an engaging person-led opener too; the old local collage needs revision before import. Cast keeps relevant candid angling/catch imagery.
Cast reference: @r1pple8, inspected September 10. Its observed formats include multi-slide useful fishing advice, illustrated problem/solution cards, and app rankings ending in its own promotion. Cast should earn attention with a concrete angling decision or useful tip before product proof. Do not fabricate comparative rankings, personal testing, or copy universal fishing promises. Never call uninspected posts winners.
Finish the image deliberately: clear hierarchy, readable proof, natural photography, generous safe areas.
Owner correction, September 11: the glossy AI poster treatment was rejected for these feed posts.
Default to REAL ordinary photography with short native outlined captions. No fake phone mockups or generated scenic poster backgrounds. Product slides must carry the exact official logo, a specific truthful benefit and a readable App Store CTA; this applies to short posts too.
Deadset two-slide lane: recognisable gym photo then a genuinely branded product answer. The owner rejected the last two rep-target posts: a changed hook/photo is not format variety. Every Deadset product slide needs the exact official logo, useful benefit, readable genuine UI and App Store CTA. Centre the full composition at x=540 on the 1080-wide canvas; do not centre it in an asymmetric safe box. Use symmetric margins. Keep copy outside app labels. Do not repeat the rep-target concept for the next post; use a different shipped benefit and format. Owner September 12 exception: approximately one in four delivered Deadset posts is the TEN-slide rules format from docs/deadset-longform-reference-2026-09-12.md. Use a collage opener, seven original numbered gym habits, genuine Deadset promotion after rule three (slide five), then a closing prompt. The app slide must use the exact official Deadset logo/lockup and red/black branding, name Deadset, demonstrate a relevant truthful benefit and include an App Store CTA. Never redraw or approximate its logo. Keep native outlined typography, coherent spacing and distinct real photos. The long format has its own supported import and independent review; never force it through the two-slide renderer.
Owner correction, September 12: Cast needs a DIFFERENT relevant real photograph on every slide.
Cast: SIX slides, real fishing/catch opener then five distinct useful items, each with its own relevant image.
Never reuse a photograph within a carousel. Match fish details to catch photos, setup to tackle, timing to light and conditions to water.
Keep font, text width, heading/body positions, outline and spacing consistent across the five items.
Prior model critiques are unverified hypotheses, never new owner instructions. Recheck them against actual pixels; consistent typography and readable centred text are intentional; repeated item photographs are now rejected.
Counted hooks must deliver that many distinct useful details; a final generic slogan is not a detail.
Actual app UI must stay unchanged and its essential labels visible. Never generate fake screens or results.
Generated illustration is a separate explicit experiment only; never silently replace this native lane.
Never stamp a second caption onto finished promotional artwork. No default arrows, circles, phone frames or feature inventories.
The answer must resolve the setup; an exercise-target diagram cannot prove twelve weeks of strength gains.
Label sample profiles and example forecasts; never turn a demo into a customer's testimony.
Opening text: normally 3-10 words. Answer: normally 1-6 words. Caption: human observation + one App Store CTA.
Evaluate every final image at full size AND as a phone preview, including TikTok overlays.
Reject clipped/duplicated copy, tiny proof, weak contrast, empty screens, generic stock, misleading proof and fabricated UI.
Reject/revise rather than filling a posting quota. Text scores and source alt text are not visual inspection.
Learn from comparable 24-72 hour own-account results; separate reach, engagement, retention and attributed installs.
No secret algorithm weights, guaranteed virality or conversion-winner claims from views/likes alone.`;

export function proofReaction(candidate: string | undefined, fallback: string): string {
  const text = candidate?.trim() ?? '';
  const words = text.match(/[\p{L}\p{N}]+/gu) ?? [];
  return text.length <= 64 && words.length >= 1 && words.length <= 8
    && !/\b(download|install|guarantee|revolutionary|game.changing)\b/i.test(text)
    ? text : fallback;
}
