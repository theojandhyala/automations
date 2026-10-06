# Four-brand Cloud Studio

LifeScore and Reclaim OAuth connections previously existed without executable cloud preparation jobs, recurring access checks or publisher routing. This change adds both exact accounts to the existing cloud pipeline and exposes all four missions in `/api/cloud-studio/view`.

- Exact app/account matching remains enforced in health checks and the atomic delivery reservation. Unknown brands stay locked.
- The existing single publisher, London slots, daily caps, ambiguity handling and exact-media signature checks remain in force.
- Each new studio runs in Cloudflare, bounded to eight preparation/review runs per London day. Original editorial typography uses registered first-party screenshots and official logos, labelled as app previews with example data. Outputs have immutable paths. Full-size and 360×640 exports were inspected; an undersized Reclaim excerpt was rejected and replaced with a larger genuine single-card excerpt.
- New-brand critic context is separate from Cast/DEADSET. The independent critic still requires every score >=8, truthful proof, safe placement and no blockers. A revised structured output contract may retry a previously malformed assessment once under its new version; valid failed assessments are not resampled to obtain a pass.
- Public launch verification uses Apple's GB listing and the existing authenticated App Store Connect connection. A submitted build is insufficient. The fallback requires a released iOS version plus current GB territory availability, excludes preorder/future release and validates pagination origin before forwarding a token.
- Preview preparation can proceed while App Review is pending; approval/booking and the final publisher hold delivery until release is verified. No additional manual setup is needed when the verified release becomes available.

## Deployment and verification

Use `scripts/build-four-brand-release.mjs` with an exported live module and its exact SHA-256. This patches only the intended integration points and emits five modules. Do not deploy the unrelated dirty checkout wholesale. Preserve `.jarvis-release`, all current bindings (including both HQ KV namespaces), secrets and existing dashboard assets.

Migration `0003_four_brand_studio.sql` is additive and copies existing pause states into four-brand controls. Configuration adds two cloud studio jobs and raises the existing publisher's per-run capacity to four distinct accounts. No duplicate publisher is installed.

Validation: TypeScript check; 72 focused tests covering exact account selection, quotas, concurrent reservations, scheduling, approval boundaries, malformed/failing critic output, public listing freshness, App Store review/preorder/territory states and credential-safe pagination. Live deployment readback matched all five module hashes and preserved all bindings. Both new studios produced complete independently reviewed carousels. Private operational snapshots and images remain under `.local/four-account-2026-10-06/` and are not committed.

Apple API references: [app availability](https://developer.apple.com/documentation/appstoreconnectapi/appavailabilityv2), [territory availability](https://developer.apple.com/documentation/appstoreconnectapi/get-v2-appavailabilities-_id_-territoryavailabilities), [app versions](https://developer.apple.com/documentation/appstoreconnectapi/get-v1-apps-_id_-appstoreversions).
