# Apple download reporting connected — 10 September 2026

This supersedes the Apple-access blocker in the earlier HQ connection report. Existing Apple reporting credentials were verified and connected through the private owner UI; no existing Apple key, app release or content queue was changed.

Verified against Apple's app catalog:
- DEADSET: Gym Workout Tracker — 6783511541, SKU deadsetfit001.
- Cast - Fishing Companion — 6793259996, SKU cast-fishing-app.
- Vendor mapping verified on the Apple Sales and Trends Reports page.

A read-only 90-day API backfill fetched 19 available daily reports. Only aggregate app totals were stored in HQ_DATA. Apple's August 10–September 9 dashboard showed 25 DEADSET app units and 13 Cast app units; the imported API reports match those totals exactly. The HQ August 11–September 9 window has the same totals, plus 17 DEADSET and 3 Cast re-downloads. The latest seven days contain 3 DEADSET and 8 Cast first-time units across four received daily reports.

Missing report dates remain unknown. The UI displays a clearly labelled subtotal when a date range has incomplete coverage, rather than hiding verified downloads or suggesting unavailable data is zero. Explicit zero is displayed only when supported by received reports. App ID/SKU and report dates are validated to prevent incorrect mapping.

Apple does not provide an individual download notification in these reports. Its reporting is next-day. The Worker now checks hourly at minute 30 and on manual Refresh, revisiting seven complete UTC days for revisions. HQ polls stored source data every 15 seconds and displays the report date, last check, received time and latest daily reports. Identical reports preserve their received timestamp so a periodic check does not masquerade as a new report arrival. Product and billing remain separate five-minute sources; app activity is not relabelled as downloads.

Verification: production Apple catalog and report API, direct comparison with authenticated Apple dashboard, 159 worker tests and 13 node tests, worker typecheck and production web build. No secrets are in Git or this report.
