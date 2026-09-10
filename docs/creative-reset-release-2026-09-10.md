# Creative quality release record

Implemented from release commit 246d1ab. Current code lives on
codex/creative-reset-quality and is integrated into the hq-live-connectors release
checkout after verification. Never deploy the older Documents checkout wholesale.

Validation: worker TypeScript, 167 Vitest tests, 13 Node tests, production web build.
Both HQ KV bindings and the six-slide Cast builder are retained. Public dashboard
HTTP 200 and unauthenticated private API HTTP 401. No social post was submitted by
this task, and existing queue holds remain in place.

Promotional artwork and captions:
/Users/theojandhyala/Documents/ChatGPT/automations/assets/creative-reset-2026-09-10/POST-PACK.md

Temporary releases caught in live QA were rolled back: an initial older checkout
release, and a frontend that assumed legacy visual-review records had the new
schema. The final implementation guards legacy records. The independent signed
backend image review remained active during the frontend correction.

Live calibration initially returned descriptive strings instead of scores. The
final prompt supplies an explicit flat schema and the parser accepts only exact
numeric strings as numbers; prose/missing scores still fail. The current actual
Cast cover returned numeric scores 8 hierarchy, 9 legibility, 7 craft, 10 story
and therefore failed the release threshold. Saved local calibration response:
Documents/ChatGPT/automations/.local/visual-probe/cast-schema-result.json.

Final deployed Worker version: `49fd51d0-e4bb-47ce-8379-f9d8a4c518b0`.
Final dashboard bundle: `index-BK1dWsno.js`.

## Completed production readback

The live Cast producer run started 2026-09-10T22:38:47Z and succeeded. The queue
shows six valid per-slide verdicts for EACH of the three curated Cast drafts
(18 final images total), all still draft/review. It identified low contrast on
white sea foam in the lure-check post and light fishing-rod/hand areas in the
notes post, as well as weaker hierarchy/craft scores. The expanded critique
panel was visually inspected in the live browser. No score threshold or owner
hold was relaxed. This is completed live model/DB/UI verification, beyond mocks.
