# JARVIS HQ live connections — 10 September 2026

Both embedded HQs now read the verified production Supabase databases and RevenueCat projects. Product and subscription overview collection runs every five minutes. Refresh triggers a new source collection and claims TikTok analytics syncing; it does not merely reload saved snapshots.

Product collection backfills 90 days of profiles and recorded activity. DEADSET activity means saved session starts and completed synced workouts. Cast activity means recorded catches and fishing session starts; known legacy sample catches are excluded. These are activity signals, not app-open DAU. Retention uses exact UTC signup cohorts and mature day boundaries. The collector exports only aggregate metrics.

RevenueCat uses separately scoped Charts & Metrics read-only API v2 keys for each project, encrypted server-side. Overview metrics preserve the provider's reporting windows and explicit GBP currency. Eight daily chart reports are collected hourly using provider-discovered daily resolution and named measure metadata. Incomplete days remain gaps. Subscription Status is a current snapshot; trial conversion is grouped by trial-start day and can change while trials are pending. Renewals are not inferred from unrelated totals.

Web Stripe subscriber counts are separately labelled from RevenueCat iOS subscriptions and MRR. No combined MRR is asserted without the Stripe price ledger.

Apple Sales & Trends remains unconnected pending the owner's App Store Connect sign-in/reporting key and vendor/app mapping. Apple downloads are daily reports; listing traffic requires App Analytics reporting. TikTok views are not counted as attributable installs.

## Verification

- Production product sources verified: DEADSET 45 profiles, Cast 14 profiles.
- Production RevenueCat overview: DEADSET 1 active trial, 0 active iOS subscriptions; Cast 0 trials/subscriptions. These are point-in-time checks, not fixed dashboard values.
- Eight historical RevenueCat reports fetched successfully for each app, with no provider errors.
- Owner-only API boundary covers new product, billing and refresh routes.
- Worker typecheck, web production build, 151 worker tests and 13 node tests passed.
- Live source connection, refresh, dashboard cards and historical charts checked in browser. Cloudflare deployment testing caught and corrected unsupported redirect:error; manual redirects now fail through HTTP status checking.
- Existing full-frame creative fixes through 9b1c84d preserved. Content approvals and holds are owned by the creative task and were not changed by this integration.

## Operations

Connections pages show successful capture times and source errors. On failure the previous good snapshots remain available. Product keys are restricted to the two fixed production origins; no browser-directed source URL is accepted. DEADSET can use the server secret DEADSET_PRODUCT_KEY; Cast is configured through the owner-only encrypted connection form. No credentials are stored in this repository.
