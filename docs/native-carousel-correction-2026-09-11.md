# Native carousel correction — 11 September 2026

The owner explicitly rejected the September 10 glossy AI promotional posters.
The requirement is finished social posts in the observed Stronger and Ripple
photo-carousel grammar. More attractive posters do not satisfy that requirement.

## Finished executions

Local pack: `/Users/theojandhyala/Documents/ChatGPT/automations/assets/native-carousels-2026-09-11/POST-PACK.md`.

Deadset: two slides. Ordinary gym-floor photograph with “You’re not training today?”;
untouched owner app capture showing REST, with “It’s in the plan.” in the empty gap
between cards. The full screenshot is contained, including its existing sample
values; it does not claim a transformation, actual user results or an active workout.

Cast: six slides. Real trout/net opener, then the same real rod/water photograph
for five distinct details: fish, timing, setup, conditions and spot. Same type,
heading/body placement, outline and spacing on every item. The final useful detail
introduces Cast naturally. This is an original catch-log promotion, not a copied
competitor rating or a claim to have tested fishing apps.

Reference evidence is in the linked September 10 audits. Stronger’s
https://www.tiktok.com/@strongermobile/photo/7683839228089847062 was inspected again
September 11: ordinary gym-floor image and a short conversational overlay.
Ripple reference: https://www.tiktok.com/@r1pple8/photo/7683475654402460935.
These are format references, not evidence that these new executions will convert.

## Rejections and fixes

- Rejected: scenic AI posters, oversized brand slogans, App Store badges and
  campaign panels as substitutes for these native carousels.
- First local Cast render contained literal `<br>` text; corrected and rerendered.
- First Cast text treatment lacked contrast against the sky; a consistent local
  contrast treatment was added and inspected on all five item slides.
- Replaced a generic final “whole session” slogan with the fifth distinct detail,
  the spot. A numbered promise must deliver the promised number of useful items.
- Deadset screenshot must not be enlarged until its UI is cropped. The known
  rest-plan asset uses contain and a 48px reaction at y=974 in its actual empty gap.
- Original photos and genuine UI sources remain separately recorded. No AI image
  generation was used for this corrected pack. Code-native HTML/CSS added captions.

## Live changes

Deployed version `00ce3d53-ddf4-40d8-b4fa-3f0e5a96968f`, based on `cfb22e8` in the
hq-live-connectors release worktree. Normal Jarvis dashboard build, both HQ KV
bindings and existing publishing slots remain intact.

- Runtime creative direction: `cast-deadset-2026-09-11-native-v3`.
- Cast renderer uses consistent native headings/body copy and removes coloured
  score badges, repeated CAST labels and generic swipe prompts.
- Deadset rest-plan proof preserves the full screen and its empty-gap caption.
- Review Queue has **Import finished photo post**. Select one post.json plus
  slide-01.jpg … slide-02.jpg or slide-06.jpg. It calls authenticated
  POST /api/artifacts/import-native, a new complete-post route; the old two-file
  replacement uploader remains separate.
- Import requires exact numbered order, JPEG headers showing 1080×1920, bounded
  files, a strict source/copy manifest and one connected account in the selected
  brand. Only Cast and Deadset are allowed. Source declarations and final SHA-256
  hashes are stored per slide. Identical package retries reuse the existing draft;
  a changed package with the same ID is rejected.
- Imports are held drafts, with no manufactured review/consent. They enter the
  independent signed image-review path and cannot be silently rerendered later.

## Verified and still pending

188 tests passed (175 Vitest + 13 Node), worker TypeScript and normal Jarvis web
build passed. Live authenticated Queue shows the new import control.
Codex inspected all eight local exports at full size and as a phone-size grid;
Deadset source and final were compared, and the interactive preview was checked.

Package IDs reserved in the manifests:
- Deadset `109ec0fe-86a1-44d4-9b69-1656945c1bd2`
- Cast `28b10aa4-cba6-41b8-808a-3d02e2588df5`

**These IDs are not yet confirmed as live drafts.** Chrome's file chooser returned
“Not allowed”; native UI inspection then reported that the Mac is locked and
could not be automatically unlocked. Finish the exact uploads after unlock,
verify hosted bytes/order/copy/account and all eight actual Jarvis preview images,
then record the new signed critic results. Do not say the local files reached
Jarvis until that readback succeeds. No public post was submitted by this task.

The 09:00/16:00 Europe/London creative heartbeat was updated to this native
format and the new importer. Keep unchanged blockers quiet; do not create a
second publisher or clear review holds to fill a slot.
