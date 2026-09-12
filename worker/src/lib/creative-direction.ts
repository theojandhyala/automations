/** Owner's 10 September reset, backed by the saved Stronger audit. */
export const CREATIVE_DIRECTION_VERSION = 'cast-deadset-2026-09-12-native-v4';

export const CREATIVE_DIRECTION = `Creative director standard (${CREATIVE_DIRECTION_VERSION}):
For a two-slide promotion: one recognisable human situation, one short setup, one visible product answer.
For Cast six-slide editorial: a concrete useful hook followed by five clear useful items. Educational posts need no app screenshot or App Store CTA. Each item can include a short explanatory sentence.
Deadset reference: @strongermobile, inspected in docs/strongermobile-creative-audit-2026-09-10.md.
The observed grammar is ordinary photo -> short conversation -> app evidence. Use original wording.
Vary gym-floor POV, between-set details, gym arrival and casual car context; do not repeat one stock scene.
Cast reference: @r1pple8, inspected September 10. Its observed formats include multi-slide useful fishing advice, illustrated problem/solution cards, and app rankings ending in its own promotion. Cast should earn attention with a concrete angling decision or useful tip before product proof. Do not fabricate comparative rankings, personal testing, or copy universal fishing promises. Never call uninspected posts winners.
Finish the image deliberately: clear hierarchy, readable proof, natural photography, generous safe areas.
Owner correction, September 11: the glossy AI poster treatment was rejected for these feed posts.
Default to REAL ordinary photography with short native outlined captions. No brand headline cards,
app-store badges, campaign panels, phone mockups or generated scenic poster backgrounds in this lane.
Deadset: TWO slides, recognisable gym photo then actual app screenshot with one short answer.
Cast: SIX slides, real fishing/catch opener then five useful items over one consistent waterside photo.
Keep font, text width, heading/body positions, outline and spacing consistent across the five items.
Prior model critiques are unverified hypotheses, never new owner instructions. Recheck them against actual pixels; consistent item backgrounds and readable centred text are intentional, not automatic defects.
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
