# Native-photo queue reset — 10 September 2026

## Authoritative queue status

The owner explicitly rejected the queued prototypes, generic/stock-looking photography and weak content. The earlier full-frame repair was a layout repair, not a satisfactory creative upgrade.

A scoped Supabase update returned **18 rows changed from approved to draft/review**: six Deadset, twelve Cast. Every changed artifact has `requires_owner_review: true` and a `creative_reset_20260910` backup containing the previous status, photo URLs and production metadata. No media or published TikToks were deleted. Do not reapprove these backups to fill slots.

The three newer six-slide Cast editorial drafts also remain drafts. Their concepts are closer to the reference, but an inspected cover still uses a posed stock-looking fisherman. They need new photography and an exact final-media review.

The existing four daily slots (12:00, 15:00, 18:00, 21:00 Europe/London), account routing, atomic reservation, retry protections and LifeScore lock were not changed. An empty quality-approved queue means a slot must be skipped, not filled with a rejected prototype. No new-style post has been published by this reset.

## Exact-media release guard

`nativeVisualReviewBlocker` is called by the shared creative assessment used before approval and publishing. Deadset/Cast finished photo exports now require `native_visual_review` with standard `native-photo-2026-09-10`, result `pass`, a real reviewer (`agent` or `owner`), valid timestamp, exact hook/caption/ordered photo URLs, and affirmative full-frame, native-photo, truth/rights and all-slides-inspected checks, plus meaningful review notes. An explicit hold still blocks release.

This is **not automatic visual analysis** and not an owner-consent receipt. No production code fabricates it. The reviewer must inspect every actual final slide. Changed URLs, order, hook or caption invalidate the review. Model text scores and old `visual_review` flags cannot substitute. Rendering drafts is still allowed. Test fixtures are confined to tests.

## Work still required — do not claim completed

- Replace the car-only Deadset sourcing constraint with inspected ordinary gym/phone-photo compositions inspired by @strongermobile, without copying their photos or wording. The current playbook still defaults to car photographs; the release guard does not fix sourcing by itself.
- Rework Cast photography toward real catch/net/rod/water detail like @r1pple8. Avoid the current posed fisherman cover and repetitive generic backgrounds. Keep useful six-slide editorial content rather than twelve legacy promotional templates.
- Inspect genuine Deadset feature captures and final crops: the full-cover logger crop can trim its heading. Do not invent UI, workout results or personal testimonials. Obtain a suitable capture/composition rather than conceal missing proof.
- Rebuild the held artifacts, inspect every final slide at native resolution and phone size, and record exact review evidence only for genuine passes. Then use the normal approval/publisher pipeline. Do not SQL-set status to approved or fabricate owner consent.
- Re-read the live queue after release: every ready artifact must have exact new-standard evidence; preserve backups and account bindings.

## Source candidates, not approved assets

Viewed Pexels 7674491 (cottonbro studio): gym-floor shoes/leggings and barbell, more natural and relevant than car stock. Viewed 23939733 (AVINASH Gond): gym mirror selfie, posed/processed; not automatically suitable. Source pages are on pexels.com with retained IDs; licensing and final suitability still need exact records.

Potential fishing candidates to inspect: 35437559, 17757924, 14438490, 17757923, 14438493. These IDs are research candidates, not approved media. Never claim stock subjects use either app.

## Access and integration checkpoint

Use `/Users/theojandhyala/.codex/worktrees/hq-live-connectors`, based on commit `7e98b21`. The HQ task confirmed no further competing deployments planned. Preserve HQ_DATA and DEADSET_BASELINE bindings, latest HQ connectors and all existing secrets. Build the normal JARVIS bundle with `VITE_DEADSET_HQ=false` into `.jarvis-release`.

At approximately 22:24 Europe/London, computer use reported the Mac locked and automatic unlock unavailable. The user was asked to unlock it. Do not extract browser sessions or bypass that lock. Until restored, final live queue replacement/review is incomplete.

Validation: TypeScript passes; 157 Vitest and 13 Node tests pass; production web build passes. No replacement has been stamped as visually approved in this reset.

Deployed safeguard: Worker `4a16f1b5-b992-45d9-be03-732027edad77`, preserving existing variables and both KV bindings. Public dashboard returns HTTP 200; unauthenticated private artifacts API still returns HTTP 401. Live authenticated queue readback remains blocked by the locked Mac.
