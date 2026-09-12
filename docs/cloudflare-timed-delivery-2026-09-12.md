# Cloudflare timed delivery repair — September 12

Cloudflare Workers hosts Jarvis, runs its minute cron and submits media to TikTok.
Codex supplies creative inspection and monitoring. The missed 19:58 follow-up was
a scheduling mistake: scheduled_for meant earliest eligible regular window, so
an out-of-window post depended on Codex opening a browser and clicking Run now.
Browser control failed during that wake. The Worker itself continued running.

The preserved Deadset artifact bf423697-bb77-47d7-90df-92323087d850 was submitted
through the normal publisher at 19:25:15 UTC and reconciled at 19:29:16 UTC.
Both live posts are verified:

- https://www.tiktok.com/@deadset.app/photo/7684732073369750816
- https://www.tiktok.com/@cast.fishing.app/photo/7684709514326707488

## Durable booking

The approved-post Queue now separates the existing earliest-time restriction
from **Book this posting time** and **Publish this exact post now**. These controls
save an authenticated, signed booking in the artifact's existing stages record;
they do not run a publisher in a short HTTP background task. Cloudflare's ordinary
minute publisher selects due bookings even outside regular slots. Timing is to
the first available scheduler pass, followed by TikTok's asynchronous processing,
not an exact-second public visibility guarantee.

A server signature binds the artifact, its content/destination fingerprint and
booking time. Future bookings cannot fire early; changed or expired bookings
return to review. Six hours is the maximum delivery grace period. Cancellation
returns the artifact to draft, so it cannot leak into a regular slot. Dates more
than one minute in the past or 30 days ahead cannot be booked. Concurrent edits
use the existing updated_at/status compare-and-swap. Retiming through the generic
earliest-time field cancels a prior exact-time booking and returns it to review.

All normal release gates remain: approved Business provider, mission routing,
source/media checks, actual native inspection, independent signed image critique,
consent and privacy checks, duplicate hook checks, account daily cap, in-flight
lock and atomic delivery reservation. A signed booking uses the existing explicit
reservation slot; ordinary unbooked content still uses the regular London slots.
The transaction now also matches scheduled_for, preventing a concurrent retiming
from crossing the final delivery boundary. No database migration, new credential,
new public access, cap increase or review-threshold change is involved.

The Codex heartbeat stays at 09:00 and 16:00 for creative work. It must book an
explicit launch ahead of time, rather than wake at the deadline to click a UI.
Music selection remains a separate unresolved issue: current publishing uses
auto_add_music. No track was auditioned or manually selected during this repair.

## Verification

Tests cover cron delivery outside regular slots, ordinary-content exclusion,
changed/expired bookings, independent image failures, refused reservations,
early/tampered signatures, non-owner access, concurrent edits, cancellation and
past-date rejection. Release version and final checks are recorded below after
deployment. This change preserves both HQ KV bindings and the normal Jarvis bundle.

Cloudflare reference: https://developers.cloudflare.com/workers/configuration/cron-triggers/

Final release: `0d0b5bcb-3af3-4261-aba3-73e68fd18e81`; frontend
`index-CnL4DyfC.js`. 194 Vitest tests and 13 Node tests passed; worker typecheck,
normal Jarvis frontend build and whitespace checks passed. The cancellation guard
also prevents the producer from automatically reapproving a cancelled/expired
booking; explicit reapproval clears that hold. Both HQ KV bindings were preserved.

The initial timed-booking release completed a real Cloudflare cron publisher run
at 19:35:39 UTC with status succeeded. No extra public post was created as a test.

The final release also completed its real Cloudflare cron publisher run at
19:36:39 UTC: run `98003f8d-730d-40fa-83a7-f40605d96803`, status succeeded.
The deployed Queue displays the new earliest-time versus booking distinction.
