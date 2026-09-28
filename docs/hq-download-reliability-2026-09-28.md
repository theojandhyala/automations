# HQ download reporting reliability — 28 September 2026

Both embedded HQs now distinguish first-time downloads, re-downloads and their
combined total over an explicitly labelled reporting period. An incomplete
all-zero subtotal is unknown, not a verified period with zero downloads.
Positive incomplete subtotals retain their report coverage label. App updates
remain excluded. Apple reports are next-day aggregates, not per-device events.

The shared data hook now isolates each source generation, discards obsolete
responses, refreshes on focus/reconnect, and coalesces requests. Existing HQ
polling remains 15 seconds. A new report receipt announces updated totals;
polling by itself is not announced as a new report. An Apple sync more than
90 minutes old is visibly overdue.

Apple collection revisits seven recent dates plus three rotating older dates
on each hourly run. This repairs delayed/revised history across the retained
90-day window. A network or validation failure on one day no longer prevents
checking the others. A temporary no-sales response cannot replace an actual
previously received report. Valid revised reports can still replace old values.
Identical reports preserve their original received-at timestamp.

Validation: worker typecheck, 33 focused worker tests, production frontend build,
local browser checks using real aggregate-only Apple snapshots for both apps,
and a React StrictMode delayed-response/source-switch check. The pre-change
compiled Worker matched the deployed module exactly, and the pre-change normal
JARVIS frontend build matched the deployed release index exactly. Both HQ KV
bindings and existing social release code are preserved. No production user or
creative records were changed by the audit.

Authenticated production UI verification requires the owner to sign in again;
the browser session reached Cloudflare Access. Live KV reads independently
confirmed recent successful product and billing collections for both apps.
Private aggregate audit data remains in ignored .local storage.
