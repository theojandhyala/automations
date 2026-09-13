# Social delivery repair — 13 September 2026

At 10:21 UK the live Jarvis dashboard showed Deadset 43 drafts / 0 ready and Cast 37 drafts / 0 ready. A configured cadence and successful cron invocations did not establish an approved delivery buffer. Chrome computer-control calls timed out, but the in-app browser recovered authenticated access; do not keep diagnosing this as a locked Mac.

## Repair

The producer excluded old Deadset renderer exports from automatic approval but only selected drafts with no photo URLs for rendering. Existing old-renderer drafts could be stranded indefinitely. The producer now rebuilds eligible system-generated two-slide Deadset drafts using the current renderer. It preserves imported/unknown production, longer authored exports, reviewed media, explicit holds, delivery bookings, attempted submissions and non-draft statuses. New media requires fresh exact-media inspection and the independent signed final-image review; thresholds are unchanged.

Safe numeric outcome counts now accompany run-finished logs. A zero-submission run is visible as zero, rather than being confused with successful publishing. Producer logs distinguish draft counts, pending rendering and outdated renderer counts.

Deployed Worker: 5fa234d8-206f-47b1-b7bf-8db468f579bd. Preserved the normal .jarvis-release frontend (no asset changes) and both HQ KV bindings. Typecheck, 213 Vitest tests and 13 Node tests passed.

Live confirmation: run a80b0d6b-c0fb-4d30-9023-d95e380b8016 at 09:26 UTC saw 30 Deadset draft candidates, selected 5 outdated drafts, rebuilt 3 and approved 1, with zero production blockers. Publisher at 09:27 UTC reported submitted: 0. Approval is not publication.

## Creative work

Deadset 71b96aa5-389e-4d57-ab09-a3bdb074e330 was revised to “Rest day. Still following the plan.” The opener uses Cole Kitchen's licensed Pexels 14019890 (natural person beside open car). The product slide uses the exact official lockup, registered first-party workout_plan asset eb3583a5-25ad-4236-bb00-2624c0ee560d, honest training/rest-day benefit, example label and App Store CTA. This promotes the existing daily plan, not the unreleased multi-scale calendar. Both c30aa220 exports were inspected at 1080×1920 and 390×693; Codex review was saved at 09:24:35 UTC. Cloudflare's independent critic then passed and the post appeared in Approved. Immediate exact-post delivery was requested through the existing booking control. Read back the final status before claiming delivery.

Cast 5dc04dfe-0ac6-433f-912b-6a085c0ac1f8, “Fishing notes tier list,” uses six distinct licensed fishing photos and five distinct note-quality tiers. All six 49cd1f3c exports were inspected at full and phone size; the final slide visibly promotes Cast and the App Store. Codex's exact-media review was saved at 09:27:49 UTC. It still needs live approval/delivery readback.

Evidence and export previews: .local/creative-director/2026-09-13-repair/. Do not reuse these source images indiscriminately or treat one repaired post as a complete five-post daily buffer.
