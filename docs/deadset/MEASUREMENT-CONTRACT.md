# DEADSET measurement contract v1 — proposed integration specification

This is the implementation contract for the missing feeds, not a claim that collection is running.

## Events

Allowlisted event names: first_open, account_created, onboarding_completed, workout_started, workout_completed, pr_recorded, paywall_viewed, trial_started, subscription_started, subscription_renewed, cancellation_requested, subscription_expired, payment_failed, refund_issued, experiment_exposed, share_created, referral_accepted.

Envelope: event_id (idempotency key), event_name, schema_version, occurred_at (UTC), received_at (server UTC), pseudonymous subject_id or anonymous_install_id, platform, app_version, environment, source_system. Campaign fields: source, medium, campaign_id, content_id, account_id, attribution_method, first_touch_at. Only allowlisted event-specific properties; no email, free text, exercise notes, raw URL queries or health/body measurements. Store user identity mapping separately with restricted access. Define retention and deletion propagation before rollout.

Workout completion comes from a successful durable save, not a screen visit. Repeated synchronisation must preserve event_id. First and second workouts derive from distinct persisted workout IDs per user. Billing events come from verified server-side provider records; client purchase success is diagnostic only. Provider event IDs deduplicate retries. Out-of-order billing events must not overwrite newer entitlement state. Track sandbox separately; reconcile RevenueCat and Stripe without double counting.

## Attribution

Capture allowed UTM values plus durable campaign/content/account IDs. Persist first and last touch separately, with timestamps. Only join an anonymous identity after an authenticated, explicit account association. Do not fingerprint or infer a person across devices. Treat install reports, first app opens and registered users as different measurements. Report platform-supported campaign aggregates separately from deterministic user attribution. Show unknown/unattributed share in every source comparison.

## Metric definitions

| Metric | Definition |
| --- | --- |
| Weekly installs | Store-reported first-time downloads for the complete reporting week; distinct from first_open |
| DAU / WAU | Distinct users completing a meaningful foreground action in the selected day / 7-day window; not background sync |
| Workouts/user | Distinct completed workouts / distinct active users for the same period; show active-user definition |
| D1 / D7 / D30 | Acquisition cohort with meaningful activity in [24n,24(n+1)) hours after first_open, divided only by users old enough to finish that window |
| Account → first workout | Users completing first workout within 7 days of signup / mature signup cohort |
| First → second workout | Users completing second workout within 14 days of first / mature first-workout cohort |
| Free → trial | Eligible free signup cohort starting trial within 14 days / mature eligible cohort |
| Trial → paid | Trial starters with first successful paid transaction within 7 days of trial end / trials mature to that observation boundary |
| MRR / ARR | Contracted recurring amount normalised by billing interval; annual / 12; exclude trials, free grants and expired subscriptions; ARR = MRR × 12 |
| Currency | Preserve original amount/currency and use dated auditable FX for GBP totals; without FX, show separate currencies |
| Cancellation / churn | Cancellation request is not expiry. Subscriber churn = paid subscribers lost during month / paid subscribers at month start |
| Refunds | Ledger events separate from MRR and cash; reconcile entitlement consequences with provider |
| Mix | Monthly and annual active paid subscribers, counts and shares, with provider coverage |
| CAC | Attributable acquisition spend / new paying subscribers for matching campaign/cohort; organic labour tracked separately |
| Gross margin | (Revenue minus attributable service costs) / revenue, with coverage and accounting period |
| LTV | Observed cohort revenue/margin to date first; forecasts labelled with assumptions and uncertainty |

Use complete Monday–Sunday Europe/London business weeks for CEO reports, UTC event timestamps and explicit boundaries across DST. Report counts alongside rates. Missing denominator, immature cohort or missing source = unavailable, not 0%. Preserve original weekly snapshots and append corrected versions with reasons.

## Content experiment record

experiment_id, hypothesis, content_family, variable, control, variant, primary_metric, guardrails, campaign/account/content IDs, planned publication window, observation horizon, stop rule, approval payload hash, approved_by/at, state, result, uncertainty, followup_of.

Lifecycle: Draft → Approved → Scheduled → Posted → Analysed. Editing the approved payload invalidates approval. Publisher checks payload hash, approval and schedule at send time. Regeneration creates a new draft. Post-now uses the existing explicit consent path. A winner requires adequate observation and quality checks; generate follow-ups as drafts, never automatically approve them. Store unavailable saves/profile visits/install metrics as null. Compare per-post cumulative counts at matched ages or snapshot deltas with coverage, never sums of successive cumulative snapshots.

## Integration acceptance tests

1. Same event delivered three times counts once; offline events preserve occurrence time.
2. Anonymous event linked at signup does not create two users.
3. Sandbox purchase never enters production revenue; annual revenue normalises correctly.
4. Older cancellation arriving after newer renewal cannot incorrectly expire entitlement.
5. Cancellation requested with paid time remaining does not count as immediate subscriber loss.
6. Immature D30 cohort is excluded, not recorded as unretained.
7. Unattributed installs remain visible; platform aggregate attribution is never promoted to person-level certainty.
8. Non-owner reads and client-side writes to analytics/billing stores are denied.
9. Provider errors show stale/partial/unavailable status; no zero replacement.
10. Edited approved content cannot publish without renewed review.
11. Deletion removes/rekeys subject-linked records according to documented retention; backups follow lifecycle policy.

## Alerts to implement after baseline

Subscription and payment anomalies; crash/release regression; failed automation or stale ingestion; exceptional post performance; API spend change; retention regression using mature comparable cohorts. Every rule specifies window, minimum sample, absolute and relative threshold, cooldown, owner and runbook. Start with observed baseline; do not invent statistically meaningful thresholds.
