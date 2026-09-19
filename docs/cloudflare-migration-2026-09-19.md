# Cloudflare operational cutover — September 19, 2026

The owner activated R2. Normal Jarvis now uses Cloudflare D1 for operational records, private R2 for recovered social media, and Cloudflare Access for owner login. Supabase REST/Auth still returns quota errors; it is retained as the historical source, not the live operational dependency. No Supabase upgrade was purchased.

## Verified recovery

- D1 `jarvis-operations`: recovered schema (15 tables, public account view, 199 columns and 59 constraints), with 308 operational rows imported. Real D1 foreign-key checks passed. This includes both encrypted TikTok connections, 138 existing artifacts, 11 automations, referenced runs, reservations, missions and latest analytics.
- R2 `jarvis-social-media`: 189 original objects recovered using original keys and matching MD5/size/SHA-256. Every recovered public GET matched its original SHA-256. The new two-slide Deadset export was separately uploaded and verified.
- Access protects only the owner login entry path, with exact-email policy, verified RS256 issuer/audience, HttpOnly host cookie and same-origin mutation checks. Existing Cloudflare identity-provider sign-in succeeded. Read-only dashboard routes are allowlisted and exclude secrets and account ciphertext.
- The normal Jarvis build uses VITE_DEADSET_HQ=false and VITE_CLOUDFLARE_AUTH=true, served from `.jarvis-release`. Both HQ KV bindings and their routes are preserved. Never deploy the older Documents checkout over this release.
- Live scheduled analytics refreshed both accounts and 33 posts without partial failures. The producer ran the independent signed image review and approved the new Deadset post. The publisher subsequently submitted that exact booked post and recorded TikTok's publish ID.

## Delivery and quality controls

London daily windows remain 10:00, 12:00, 14:00, 16:00 and 18:30. Cloudflare is the sole publisher; the existing Codex heartbeat prepares and inspects content. Atomic claims/reservations preserve the per-account five-post cap, account routing, duplicate-slot protection and ambiguous-submission holds. Cron failures now propagate to Cloudflare rather than appearing successful after a caught dispatcher failure.

The 95 legacy drafts were retained but cancelled from delivery and held for revision. An interrupted producing mission was marked failed so it could not starve new work. Future automation times were recomputed; no missed-slot backfill was performed. Old media and old reviews were not reused as approval for new output.

The final-image gate still binds exact ordered bytes, copy, product context and destination. The review-role correction distinguishes a candid opening photo from its mandatory branded product answer; it does not lower the aesthetic threshold or bypass source comparison/signatures.

## Limits and recovery

This is an operational migration, not a full historical dump. The original inventory contains 482 objects; 293 were not recovered locally and still depend on the unavailable legacy source. Full old events, metrics and run history were not imported. Preserve Supabase and the private backups until a later full archive reconciliation. Never describe old dashboard history as complete.

Do not roll back to the Supabase-backed publisher without reconciling every D1 submission/reservation first. Doing so could duplicate posts. Private recovery SQL, encrypted records and hashes remain in the protected local migration directory and must not be committed. New immutable media and D1 records are now authoritative for delivery.

Named commercial music attachment remains unfinished: the publisher uses TikTok automatic music. No exact soundtrack selection or audition is claimed.

## Release evidence

Latest deployment: `2f725c76-f973-4669-a688-27520ed0aaad`, September 19. Both HQ_DATA and DEADSET_BASELINE bindings remained unchanged. Validation: 248 Worker tests and 13 Node tests passed; Worker typecheck and normal Jarvis production build passed. Tests include D1 atomic reservations/claims, DST windows, query safety, Access signatures/cookie mutation protection, immutable R2 objects and exact-media review gates.

See `social-creative-research-2026-09-19.md` for inspected references, failure lessons and actual creative changes. See `social-restart-2026-09-19.md` for delivery state and historic post evidence.
