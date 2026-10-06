# Cloud Studio — 6 October 2026

JARVIS now has an owner-authenticated cloud operations view at `/api/cloud-studio/view`. The API is `/api/cloud-studio`; the existing owner authentication applies before reads or mutations. Cross-origin control writes are rejected. The HTML shell contains no private data.

The existing Cloudflare dispatcher remains the executor and the existing TikTok publisher remains the only delivery authority. No laptop process or Codex desktop heartbeat is required. Existing generation jobs run at 05:00 and 17:00 UTC; producers at minute 05 every three UTC hours. Public posting windows remain 10:00, 13:00 and 17:00 Europe/London, using the existing DST-aware scheduler. LifeScore and Reclaim remain unchanged.

- Shared D1 admission ledger caps each brand at two generation batches and eight production/review runs per London day, including manual runs. Routine configuration limits generation to three concepts and production to one rendering candidate per run. Counts are workload allowances, not guaranteed pound or token ceilings.
- A six-post approved reserve stops additional preparation; independent signatures are verified in the studio and again at release. Unrendered backlogs prevent adding more draft work.
- A render attempt is atomically reserved by artifact and input hash. New output paths and critique timestamps cannot reset it. Revised inputs or renderer versions allow another attempt. A source correction outside the hashed brief requires an explicit revision/version change. Transient rendering failures also need that retry; this conservative first version does not retry arbitrary errors indefinitely.
- An exact failed visual critique is not repeatedly resubmitted for another score. Unavailable reviewer errors keep the existing 24-hour retry path. No independent review threshold, source policy or product-truth gate changed.
- Cast's active and rejected topics remain reserved in the recent planning window. Cloning a failed topic into a new artifact is not a remedy. Existing saved feedback continues to inform briefs.
- Pause/resume updates cloud admission and the existing brand promotion flag atomically. Already-running preparation can finish; already-submitted TikTok requests cannot be recalled. Resume preserves daily allowances and release checks.
- Dashboard publishing readiness now requires a fresh successful account access check, rather than developer-app approval alone.

## Release and verification

Built onto the exported live module with SHA-256 `7499364675cbe6de9d481f66e5b1bbff1c4937ef282f8a08506b51d99639521f` using `scripts/build-cloud-studio-release.mjs`. All exact-match patch anchors are checked. The release contains the patched `index.js` and two isolated Cloud Studio modules. Existing dashboard assets and every Worker binding were preserved and verified after upload. Private deployment evidence lives under `.local/cloud-studio-2026-10-06`; do not commit it.

Applied additive migration `0002_cloud_studio.sql`. Typecheck and 67 focused tests pass, including concurrent admission, exact-input retry claims, pauses, origin checks, stale health and Cast topic reuse. Verified the owner page in Chrome, a live pause/resume round trip (restored to running), and HTTP 401 for unauthenticated private data. Confirmed actual cron runs generated three drafts for each brand; Cast rendered one candidate; DEADSET held a composition failure.

At verification neither brand had a complete signed future reserve. TikTok token renewal still returned HTTP 403 client-IP rejection (existing support ticket 4481124). The deployed manager does not resolve that provider restriction, promise successful posting, or certify that every candidate is good. Current creative blockers include DEADSET composition bounds and Cast source-to-instruction relevance. They remain visible and fail closed.

The friendly `/cloud-studio` handler also exists in source, but the preserved live static-asset routing takes precedence there. Use `/api/cloud-studio/view` until a reviewed dashboard asset release adds a navigation route. This backend release deliberately does not overwrite the existing dashboard bundle.
