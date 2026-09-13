# Social delivery repair — 13 September 2026

At 10:21 UK the live Jarvis dashboard showed Deadset 43 drafts / 0 ready and Cast 37 drafts / 0 ready. A configured cadence and successful cron invocations did not establish an approved delivery buffer. Chrome computer-control calls timed out, but the in-app browser recovered authenticated access; do not keep diagnosing this as a locked Mac.

## Repair

The producer excluded old Deadset renderer exports from automatic approval but only selected drafts with no photo URLs for rendering. Existing old-renderer drafts could be stranded indefinitely. The producer now rebuilds eligible system-generated two-slide Deadset drafts using the current renderer. It preserves imported/unknown production, longer authored exports, reviewed media, explicit holds, delivery bookings, attempted submissions and non-draft statuses. New media requires fresh exact-media inspection and the independent signed final-image review; thresholds are unchanged.

Safe numeric outcome counts now accompany run-finished logs. A zero-submission run is visible as zero, rather than being confused with successful publishing. Producer logs distinguish draft counts, pending rendering and outdated renderer counts.

Deployed Worker: 5fa234d8-206f-47b1-b7bf-8db468f579bd. Preserved the normal .jarvis-release frontend (no asset changes) and both HQ KV bindings. Typecheck, 213 Vitest tests and 13 Node tests passed.

Live confirmation: run a80b0d6b-c0fb-4d30-9023-d95e380b8016 at 09:26 UTC saw 30 Deadset draft candidates, selected 5 outdated drafts, rebuilt 3 and approved 1, with zero production blockers. The next producer run rebuilt the remaining two stale drafts at 09:31 UTC. All five stranded drafts are now rebuilt. Publisher run a777f7aa-a423-4085-9bc6-347083338854 submitted the approved Deadset post at 09:28 UTC, and reconciliation confirmed published: 1 at 09:30 UTC.

## Creative work

Deadset 71b96aa5-389e-4d57-ab09-a3bdb074e330 was revised to “Rest day. Still following the plan.” The opener uses Cole Kitchen's licensed Pexels 14019890 (natural person beside open car). The product slide uses the exact official lockup, registered first-party workout_plan asset eb3583a5-25ad-4236-bb00-2624c0ee560d, honest training/rest-day benefit, example label and App Store CTA. This promotes the existing daily plan, not the unreleased multi-scale calendar. Both c30aa220 exports were inspected at 1080×1920 and 390×693; Codex review was saved at 09:24:35 UTC. Cloudflare's independent critic then passed and the post appeared in Approved. Immediate exact-post delivery used the existing booking control. Jarvis and the public TikTok page verified delivery: https://www.tiktok.com/@deadset.app/photo/7684949315520875809 . The live post carries the promotional-content label. TikTok automatically selected “pacify her instrumental” by nadia, sound ID 7084930785211321094; this was not an auditioned/named-track selection.

Cast 5dc04dfe-0ac6-433f-912b-6a085c0ac1f8, “Fishing notes tier list,” uses six distinct licensed fishing photos and five distinct note-quality tiers. All six 49cd1f3c exports were inspected at full and phone size; the final slide visibly promotes Cast and the App Store. Codex's exact-media review was saved at 09:27:49 UTC. The producer approved it at 09:32 UTC. The queue read back a confirmed booking for September 13, 12:00 Europe/London; it is scheduled, not yet published. Commit the date field and reload its saved value before pressing Book, to avoid the on-blur mutation racing the booking fingerprint guard.

Evidence and export previews: .local/creative-director/2026-09-13-repair/. Do not reuse these source images indiscriminately or treat one repaired post as a complete five-post daily buffer.

## Additional authored buffer

Revised package cf1095b2-d27d-4cbc-b2d0-5785bf9120ba, “7 gym habits worth keeping,” is in assets/deadset-rules-2026-09-13/. It replaces the previous collage cover with licensed Vine 8556753, a real person walking beside a black car. All ten final images were inspected at 1080×1920 and 390×693. The exact official logo and original daily train/rest proof appear on slide five. Initial package b8a4d3cd-051b-4d8c-a0b8-695a1a473e31 was held on slides 4 and 7 (craft 7/10), then rejected as superseded. The actual revision moves rest-day copy below the subject’s face/phone and removes the dark overlay from slide 7. Both changed exports were re-inspected full and phone; the other eight remain byte-identical. Revised import through Jarvis succeeded and Codex inspection was saved at 09:48:27 UTC. Independent review passed all ten slides and the producer approved cf1095b2 at 09:49:55 UTC (run 70b5b571-3c8a-49f6-b259-dd88521f7999). The authenticated queue then confirmed a September 13, 12:00 Europe/London booking for this exact artifact. Both noon posts are now booked; this is not yet public delivery. The full daily buffer is still incomplete.

The supported complete-post import works through the visible “Import finished photo post” label and file-chooser API. Clicking the hidden input stalled a tab; opening a fresh authenticated in-app tab recovered access. The marketing skill and existing creative-director automation now preserve the working access route, actual readiness checks, exact IDs, no duplicates, and quality-before-volume requirements.

## Next preparation

The existing creative director next runs at 11:00 Europe/London. Prepare the 14:00, 16:00 and 18:30 buffer for both brands, then verify noon delivery. Do not duplicate the public rest-day post or either noon booking. Do not queue another long Deadset post today. Mechanical feature-label fallback hooks in tiktok-generate remain a known creative weakness and must be rewritten before exact-image review; the stale-renderer repair does not itself solve every content defect.
