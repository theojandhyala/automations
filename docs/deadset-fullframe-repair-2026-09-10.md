# Deadset full-frame repair — 10 September 2026

> Superseded queue status: the owner rejected the photography/creative quality after this layout repair. All six Deadset and twelve legacy Cast approvals below were moved back to draft/review. They are NOT ready to publish. See `creative/native-queue-reset-2026-09-10.md` before any release.

## Source and deployment

Integrated checkout: `jarvis-quality-release`, preserving HQ/Cast work and both KV bindings.
Commits: `8e0c562`, `083980f`. Worker release: `87c1a62c-e83a-4b61-9d3c-fe254cf8b897`.
Build used `VITE_DEADSET_HQ=false`; deployment retained existing variables.
Worker typecheck, 143 Vitest tests and 13 Node tests passed. Web production build passed.

The old renderer restricted the *entire proof* to 778×610 inside a 1080×1920 canvas.
The new renderer fills the image canvas; safe bounds restrict additional text only.
It rejects card-shaped or low-resolution sources instead of blindly cropping their UI.
Finished assets must be 9:16 and receive no overprinting.
Actual rendered proof was inspected, and the reaction moved into measured gaps:
workout plan y=980, logger y=590, with a 64px text-height gate.
Renderer version: `tiktok-classic-v4.1-deadset-fullframe`.

Replaced two marketing/card sources with genuine existing app captures:

- `workout_plan`: `/Users/theojandhyala/deadset/public/screenshots/train.png`
  → `features/deadset/workout_plan/b8570478-36b1-49fa-8cdf-c90341bad79f.png`
- `live_logger`: `/Users/theojandhyala/deadset/public/screenshots/logger.png`
  → `features/deadset/live_logger/fcb7b786-5459-4edb-b575-7d9932fe7edb.png`

These are product demonstrations, not claimed customer transformations. No screenshot values were fabricated.
Dark areas intrinsic to the app remain; no letterbox or miniature advertising card is added.

## Queue repair

Ten unposted, approved Deadset v2 exports were moved to draft/review.
Their former media, hook, caption, production record and status remain in
`asset_manifest.layout_repair_backup`. No media files or published posts were deleted.
Other existing Deadset drafts were held for review; the producer cannot reapprove legacy exports.
Deadset generation remains four/day, temporarily restricted to the two properly sourced features.
Muscle/progression sources need genuine matching screen replacements before rotation resumes.

Six existing artifacts have replacement original copy, full-frame renders and visual QA:

- `6f606575-759a-4fa3-8948-2c336a68c7a8` — Still deciding what to train in the car?
- `a6946556-1b70-4042-a07f-a58cbaa8b147` — An hour in the gym. Ten minutes choosing exercises.
- `66df38b8-07aa-4b52-ac8a-20e212fbcc38` — Monday me finally left Friday me a plan.
- `a9282058-dad8-4109-a33f-1e45e3549ef8` — Turning up is easier when the week is already planned.
- `ac343aa4-7bb3-46c1-8ec8-cdd9578ef050` — Was that set two or set three?
- `4d0ee038-9c31-46de-866e-57e44e3dcb4c` — Rest timer brain. Forgot the entire set.

All six temporary repair holds were cleared after agent visual review, preserving the
owner's existing quality-gated automatic-release policy (not inventing a new human review receipt).
The sixth required another rebuild after duplicate-photo detection. Its final render
`1a3b56c2-1b37-46ac-9678-b92a6d2ec337` uses a distinct photograph and was inspected.
Commit `9b1c84d` makes the recent-photo exclusion use `updated_at`, so old drafts
rebuilt today participate. The HQ task merged all three commits and deployed them
in version `d4a24660-42f9-4441-92d8-d6b26b02504a`.

Producer run `f924d2fe-a8f2-485b-bf32-7fc5de791e8a` passed, auto-approving the first
three replacements. Studio trigger clicks did not advance the idle producer's
`next_run_at`, so the same bounded scheduling operation was applied to exact
producer `31b83959-9cfa-4016-98dc-09bc6cc2941b` at 21:05:27 UTC. The scheduled
dispatcher ran it at 21:05:49 UTC and it returned idle with no failure.

Final live readback: **Deadset 6 approved, Cast 12 approved, neither in flight**.
The six corrected Deadset posts are ready under the normal automatic quality gates.
Both destination accounts have daily limits of four; publisher is enabled with
`local_hours=[12,15,18,21]` in Europe/London. Tomorrow's four slots have final media
available on both accounts. Studio trigger acknowledgement remains a UI diagnostic
follow-up; the recurring producer and publisher dispatcher are functioning.

## Verified delivery state

Publisher enabled with minute cron and local hours `[12,15,18,21]`, Europe/London.
Both exact accounts have four/day limits. Generators and producers enabled; LifeScore disabled.
Reconciliation enabled every ten minutes. No reservations reset and no catch-up duplication.

The 21:00 reservations on 10 September both settled as published:

- Deadset `83e00bd9-3fba-44e5-8cc8-278425465174`, TikTok `7683998981130587424`,
  reconciled 21:10 London.
- Cast `c44cc99b-b44b-4fe3-bba8-8b06ce736aa4`, TikTok `7683998952231914784`,
  reconciled 21:20 London.

Both also had earlier manual posts at 19:42 London. These are older creatives, not the repaired exports.
Next normal slot: 11 September 12:00 London. Successful past delivery is not a guarantee of future platform availability.
