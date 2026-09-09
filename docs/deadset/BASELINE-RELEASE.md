# Baseline and attribution release

## Implemented

- Read-only baseline collector for the configured DEADSET Supabase source, using exact row counts and pagination rather than silent sample caps.
- Counts registered/synced profiles, seven-day signups, completed workout activity and first/second workout users. Deduplicates sessions by user and session ID, excludes unfinished/future/invalid records, and separately reports orphan states.
- Live Stripe subscriber, trial and cancellation counts. Sandbox and unknown-expiry records are excluded and reported. RevenueCat is not included; this is not total paying users or MRR.
- Owner-authenticated `/api/deadset/baselines` GET/POST, strict aggregate schema, 64 KB streamed body limit, no-store responses, append-only snapshots and private database access.
- HQ import, recorded metrics, attribution counts, freshness and coverage warnings.
- App-side campaign/medium/content/account attribution. Preserves original source, separately records latest marketing touch, removes referrer query/path data from new captures, and clears device attribution at account exit.

## Collect a private snapshot

From the automations repository, using a supported Node version with TypeScript stripping:

```sh
node --experimental-strip-types --env-file=/Users/theojandhyala/deadset/.env scripts/collect-deadset-baseline.mjs .local/deadset-baselines/UNIQUE-NAME.json
```

The output path must not exist. Credentials stay in the existing ignored environment file, are never printed and are sent only to the configured HTTPS Supabase origin. Raw source data is used transiently to calculate counts; only aggregates are written with private file permissions. `.local/` is ignored by Git. Collectors are bounded to 100,000 rows and reject changed page counts. Cross-table reads are not a transactionally consistent snapshot; run during low activity and investigate discrepancies rather than claiming perfect coverage.

A first snapshot has been collected locally. It is not bundled into the website or committed to Git.

## Reviewed release sequence

1. Review both PRs. This checkout includes unrelated unfinished changes; deploy a clean checkout of the reviewed commit, not the working directory.
2. Apply `supabase/migrations/0021_deadset_baselines.sql` to the automation dashboard's staging database. This migration does not alter the DEADSET product database and does not require the unrelated pending 0020 changes.
3. Deploy the reviewed automation Worker and web build to staging with existing owner authentication.
4. Sign in as owner, import the aggregate JSON in DEADSET HQ, verify source counts and timestamps. Test non-owner access and duplicate import. Missing storage must show unavailable rather than zero.
5. Approve production migration/deployment and repeat the import. The migration is additive. Roll back the code to remove the feature; retain snapshots privately until an explicit retention decision.
6. Ship the attribution app change through the existing web/iOS release pipeline. New fields cannot recover historical campaign identifiers or bridge unidentified App Store installs.

## What remains

- Automatic scheduled baseline collection is not enabled; the current collector/import is explicit and reproducible.
- RevenueCat server-side billing feed and price/currency ledger; App Store install reports.
- Foreground app activity events, first-open cohorts, D1/D7/D30 and matured trial conversion. Workout-active counts are narrower than DAU/WAU and must remain labelled accordingly.
- Campaign identifiers at landing are observational, not guaranteed causal attribution. Do not infer per-post installs from them.
- Investigate orphan states without deleting or rewriting user data.
- Safely replace legacy full-referrer values as part of a reviewed data-retention migration; this change only sanitises new captures.
