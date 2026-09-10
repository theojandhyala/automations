# App HQ workspaces inside JARVIS

DEADSET and Cast cards open `/hq/deadset/overview` and `/hq/cast/overview`. Each has Overview, App Store, Product & retention, Revenue, Content & operations and Connections pages, with 7/30/90-day periods, chart data tables and CSV export. The app switcher retains JARVIS authentication. This is an integrated workspace, not a cross-origin iframe; the original DEADSET HQ remains accessible from its sidebar.

## Sources and semantics

- DEADSET reads the existing HQ aggregate snapshot KV. Synced workout activity is never labelled foreground app activity, and Stripe subscriber counts exclude iOS. Daily snapshots accumulate in a separate HQ namespace; no fabricated historical series is backfilled.
- TikTok channels, follower snapshots, artifacts, post metrics and app-specific automation controls use existing records scoped by app ID. Post engagement uses the latest observed lifetime value per account/post pair; it is not period-earned engagement or install attribution.
- Apple reporting credentials use the existing encrypted server-side integration. Connections maps the app ID and verified SKU, plus the vendor number. Daily Sales & Trends reports sync for the previous seven complete days at 08:30 UTC, and can be requested manually. Existing reporting days are revisited for corrections. Apple unavailability remains a gap.
- First-time units use product types 1, 1F and 1T; re-downloads use 3 and 3F. Updates are excluded. Parent SKU scopes in-app proceeds to the right app. Proceeds are units × per-unit developer proceeds, separated by currency. Bundle credits are excluded from refunded units. Estimated proceeds are never MRR.
- Aggregate JSON imports support app_store_export, product_export and billing_export with explicit source descriptions, app identity and unique dates. Null is unknown; zero must be explicit. Provider field allowlists prevent product imports from pretending to supply billing. Retention percentages require mature cohorts with a consistent definition.
- Period totals require complete daily coverage. Snapshot values show their date. CSV uses blanks for missing values. App switching and date changes remount data state to prevent stale cross-app or cross-period responses appearing under a new heading.

## Coverage still requiring setup

App Store impressions/page views need analytics exports; the Sales & Trends endpoint does not supply them. Cast product activity and comprehensive iOS billing need verified source exports or a future provider adapter. No claim of live MRR, churn, trial conversion, cohort retention, or content-attributed installs is made from partial records.

## Deployment and controls

`HQ_DATA` is a dedicated KV namespace (`60862cecd4b04329ab0b2ea25e4bcc75`). `DEADSET_BASELINE` binds the existing HQ snapshot namespace for reads. Existing snapshot keys are never modified. App HQ APIs require the verified owner token and return no-store responses. Report bodies are streamed with a byte limit. Scheduled report sync is separate from the publishing dispatcher so reporting latency cannot delay posting.

No database migration, production app code change, or content publication is included. Rebuild with `VITE_DEADSET_HQ=false` and deploy the `automations` Worker with `--keep-vars`; the standalone `deadset-hq` deployment is unchanged.

## Validation

Worker typecheck, 140 worker tests, production web build and Wrangler dry-run passed. Tests cover unauthenticated read/write rejection, bounded report input, cross-source validation, incomplete periods, Apple app isolation, updates/re-downloads/refunds, bundle credits and separate currency proceeds. Live deployment `70f16801-692c-437a-9774-827c5446f764` was verified in the authenticated browser: both branded HQs, app switching without cross-app product data, 7-day/30-day filters, chart observations, Cast post performance, DEADSET product counts, source setup and return links. The unauthenticated live HQ API returned 401. Apple reporting is not configured; Cast product and complete billing feeds remain explicit gaps.

## Provider references

- [Apple Summary Sales Report](https://developer.apple.com/help/app-store-connect/reference/reporting/summary-sales-report)
- [Apple product type identifiers](https://developer.apple.com/help/app-store-connect/reference/reporting/product-type-identifiers)
- [Download sales reports](https://developer.apple.com/documentation/appstoreconnectapi/get-v1-salesreports)
- [Downloading Analytics Reports](https://developer.apple.com/documentation/appstoreconnectapi/downloading-analytics-reports)
