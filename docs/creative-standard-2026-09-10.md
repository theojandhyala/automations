# Cast / Deadset creative reset

**September 11 correction supersedes the poster direction below:** read
[native carousel correction](native-carousel-correction-2026-09-11.md).
The owner rejected glossy AI posters for these feed posts.

Owner direction, 10 September 2026: stop cheap-looking posts, study the actual
reference accounts, generate attractive promotional artwork, inspect every
finished export, learn from mistakes and make Jarvis follow the resulting standard.

## Evidence and limits

- [Detailed Stronger audit](strongermobile-creative-audit-2026-09-10.md): eight
  inspected posts, including six with both slides inspected. Stronger usually
  uses an ordinary personal photo, a short conversational setup, and app proof
  with a very short answer. The earlier audit was saved but not fully applied.
- [Ripple @r1pple8](https://www.tiktok.com/@r1pple8), inspected live September 10:
  3,095 followers and 56.1K profile likes at inspection. Latest grid included
  app rankings (4,407 / 30.8K / 64.4K displayed views), useful angling topics,
  lures, fishing times, and problem/solution cards. These are observations, not
  retention, paid/organic distribution, causal proof or install results.
- [App ranking example](https://www.tiktok.com/@r1pple8/photo/7683475654402460935):
  inspected opening, Fishbrain entry and Ripple payoff. Six-slide structure.
  Opening uses a held fish and short outlined white text; later slides use a
  rod over sunset water, numerical ratings and logos. Own app receives 10/10.
  At inspection: 1,835 likes, 47 comments, 629 favourites, 219 shares.
  We did not inspect every intermediate card. Do not repeat its ratings or
  claim to have personally tested competitors without actual testing.
- [Problem/solution example](https://www.tiktok.com/@r1pple8/photo/7683084062684204295):
  inspected high-sun/low-light and cold-snap/stable-temperature cards, plus a
  transition through pressure advice. White illustrated comparison cards,
  vertical divider, red arrows, short headings and a small Ripple mark.
  At inspection: 269 likes, 82 favourites, 31 shares. Its simplified fish-behaviour
  implications are not universal facts; CAST copy must retain uncertainty.
- [TikTok's performance creative guidance](https://ads.tiktok.com/resources/help/article/creative-best-practices)
  recommends vertical media, clear safe zones, sound and a native visual style;
  it treats these as starting points for testing. A carefully made native post
  can be sparse without looking careless. Glossy artwork is a distinct creative
  treatment, not a universal substitute for useful or entertaining content.
- [TikTok recommendation explanation](https://support.tiktok.com/en/using-tiktok/exploring-videos/how-tiktok-recommends-content):
  use observed interactions and own-account results, not invented ranking
  weights or algorithm guarantees. No hashtag or posting frequency guarantees reach.

## What actually failed

1. The existing quality score read strings and template metadata, not pixels.
2. Deadset was locked to one car-walk scene despite the broader Stronger audit.
3. Production overwrote authored second-slide reactions with generic fallbacks.
4. Already-designed promotional proof was treated as a raw screenshot and
   stamped with a second caption, sometimes under TikTok controls.
5. Emotional lanes could use an exercise-target diagram as implied progress.
6. Missing proof assets limited variety. Live studio had 4/6 Deadset features;
   heatmap and PR wall were absent. The workout-plan asset actually showed REST.
   A hook promising an active workout must not ignore the rest-day screen.
7. Existing analytics used arbitrary 4x comment / 6x share multipliers without
   identifying them as internal heuristics. These were not TikTok's weights.

## Production requirements

Every creative must specify audience, one promise, source reference, original
hook, exact proof, caption/CTA, audio mood, disclosure and one test hypothesis.

Deadset: ordinary gym moment -> human setup -> faithful product evidence.
Rotate floor POV, between-set detail and arrival/car context. Avoid generic
campaign photography. An exercise-target map is not strength progress. A labelled
sample is not a customer's result. Do not manufacture a personal heartbreak story.

Cast: useful angling content or a concrete field decision -> app-assisted action.
Use the observed Ripple educational approach as an additional creative lane.
The current Cast renderer produces SIX slides from a curated, original topic bank,
with four educational posts per occasional promotional story. Preserve this lane
and the existing exact-review holds. See [the full Ripple audit](creative/cast-ripple-review-2026-09-10.md).

Promotional artwork: one headline, one readable proof excerpt, one discreet CTA.
Generated scenery, textures and illustration are allowed; fabricated product
screens/results are not. Keep a generated marketing illustration labelled as
such and out of the exact-screen registry. Preserve example/sample labels.
No extra caption on a finished composition. No default phone frame, arrows,
circles, repeated CTAs, or tiny feature inventories.

Inspect the final pixels and the actual upload preview when available. At a
minimum reserve top 12%, bottom 25%, right 15% for variable platform chrome.
Prefer essential content inside x=8–80%, y=16–68%. Safe-zone percentages are a
conservative production rule, not a claim that TikTok chrome is fixed.

## Implemented enforcement

`creative-direction.ts` is injected into future carousel prompts.
`creative-photo-templates.ts` rotates three validated Deadset source searches.
`proofReaction()` retains a valid short authored answer. A separate image
classification detects precomposed marketing artwork and suppresses the extra overlay.

The producer stages rendered media as drafts. A subsequent bounded producer
pass sends all two or six final images individually, with the complete story context, to
Gemma 4 vision through the existing Workers AI binding. It records transcribed
copy, an evidence-based observation, legibility/hierarchy/craft/story scores,
safe-area and truthful-proof decisions, and specific defects. All four scores
must be at least 8/10; any hard defect fails. These are editorial thresholds,
not performance predictions. Model criticism can still be wrong.

A server signature binds the review to the exact media URLs, ordered slides,
copy, product context and destination. The publisher checks the signature and
current fingerprint before a delivery reservation. Legacy approved items with
no matching review return to draft; existing in-flight posts are not resubmitted.
Malformed/unavailable model output cannot grant approval. Failed unchanged
images are not rescored more than once per day. Editing creates a new fingerprint.
The Deadset generator sees the latest eight visual failures as explicit lessons.
Cast retains its curated copy bank and attaches the latest eight failures to
each new brief so the final critic explicitly checks them. This is feedback,
not an autonomous redesign of the curated bank.
The existing native-photo review and explicit owner holds also remain enforced;
a model pass alone cannot clear a held post.

The critic estimates phone-scale legibility from final image inputs; it does
not operate TikTok's native upload UI or compare every UI pixel with app source.
For generated masters, Codex must still inspect actual phone previews and check
source fidelity. This distinction must remain visible in status reports.

## Learning loop

Keep one record per post: source/post URL, hook family, photo template,
proof feature, creative version, experiment hypothesis, review failures and fixes.
Compare own-account metrics at comparable 24–72 hour maturity. Missing data is
unknown. Separate views/engagement from retention and attributed installs.
Use at least three measured examples before treating a feature as provisionally
performance-informed; this is an operational exploration rule, not significance.
Change one creative variable per test. A format copied from a popular post is
a hypothesis until Cast/Deadset results support it.

Future research should compare recent typical posts with popular examples,
rather than cherry-picking pinned winners. Update this ledger with actual
evidence and resulting code/assets. Do not merely append another promise to improve.

## Release provenance

Implemented against the actual latest release, commit `246d1ab`, in
`/Users/theojandhyala/.codex/worktrees/creative-reset-quality` on
`codex/creative-reset-quality`. The original Documents checkout was behind the
release and must not be deployed wholesale. Preserve HQ integrations, both KV
bindings, the six-slide Cast renderer and the full-frame Deadset renderer.

## Verification and observed limitations

TypeScript passes; 167 Vitest and 13 Node tests pass. The production dashboard
build passes. Production returned dashboard HTTP 200 and unauthenticated private
API HTTP 401. The Gemma binding was tested on a real source screenshot and
correctly read its REST screen. A known-bad Cast final image was rejected for
overclaiming the forecast, tiny app text and overlapping captions.

The image model sometimes guesses safe-zone problems or mistakes genuine app
sample values for contradictions. Its output is evidence to review, not an
infallible aesthetic authority. Human final-phone inspection remains necessary;
never lower a threshold merely to clear a held queue. Preserve actual UI rather
than asking image generation to redraw it.

The review queue now labels the old numerical score COPY AND STRUCTURE CHECK
and shows a separate recorded image critique with per-slide findings. The
publisher validates the current signed review, even when the UI displays an
older recorded critique.
