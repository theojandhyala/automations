# Cast and Deadset creative work

For promotion, posting, creative generation or renderer changes, read
`docs/creative-standard-2026-09-10.md` and the brand reference audits it links.
The owner's September 10 direction is quality before output volume. Do not
claim that changing prompts alone fixes the system or that a text score is visual QA.

Preserve the independent final-image release check in
`worker/src/lib/creative-visual-review.ts`. A review applies to exact media,
copy, product context and destination. Failures must inform later briefs.
Never weaken the threshold to clear a queue. Keep source provenance and product
truth separate from aesthetic scores.

Read `docs/native-carousel-correction-2026-09-11.md` for the latest owner correction.
The September 10 glossy AI posters were rejected. Default to real native photo
carousels: two Deadset slides, six Cast slides with consistent item layouts.
Reserve generated promotional artwork for a separately explicit experiment. Keep
actual UI as first-party product evidence; generated illustrations must not be
silently registered as exact screenshots. Never stamp another caption over a
finished promotional image. Inspect final images at full and phone sizes.

Deadset's observed Stronger grammar and Cast's observed Ripple grammar differ.
Use original brand-specific executions; don't clone wording, footage, identity,
unsubstantiated results, rankings or testimonials. Save references and measured
results rather than repeatedly rediscovering the same mistakes.

This is a shared workspace with existing changes. Preserve unrelated edits and
the deployed dashboard assets when releasing backend-only creative fixes.

Release base: this change was built from the current `246d1ab` release. The
Documents/ChatGPT/automations checkout contains older and unrelated local work;
never deploy it wholesale over the current release. Use the release branch in
hq-live-connectors after integrating codex/creative-reset-quality, preserve both
HQ KV bindings, and build normal Jarvis with VITE_DEADSET_HQ=false. The release
bundle is .jarvis-release, not a standalone Deadset-HQ dist directory.
