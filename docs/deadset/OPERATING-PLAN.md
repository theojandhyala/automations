# DEADSET operating plan

Status: implementation started, not a completed growth system. Start: 9 September 2026. Owner: Theo. Technical execution: Codex.

## Mission and targets

For the next 90 days, prioritise DEADSET. Do not start unrelated products or turn the internal growth system into a marketing SaaS. Milestones: 100 retained paying users → 500 → 1,000 → £10k MRR → £25k → £50k. These are targets, not forecasts. Count retained paying users separately from all currently paid users: show both, with retained defined as paid customers who have completed at least one renewal. Annual subscribers have a longer evidence window; report them separately.

## Verified starting point

- Automations repository: React dashboard, owner authentication/RLS, Worker scheduler, review queue, generation/production/publishing, analytics snapshots and run logs already exist.
- DEADSET repository: RevenueCat integration, Stripe subscription tables, first-touch source/referrer capture, existing reminders, PR/progress features, sharing-related product work. Their presence is not proof of quality, usage or measured impact.
- Source attribution currently omits campaign, medium, content and account identifiers. An anonymous web visitor is not automatically joinable to an iOS installation.
- TikTok snapshot `views_28d` currently represents lifetime metrics of sampled recent posts. HQ labels this explicitly; it must not be used as weekly reach or attributable installs.
- Both repositories contain pre-existing work. This branch adds the HQ page and planning documents without committing that work.
- Current baseline is unknown. Product analytics and billing data are not connected to HQ. Do not seed invented numbers.
- The existing publisher includes unattended-publishing code. Before enabling the new operating process, verify production configuration and enforce the requested human-approval gate in every publishing path.

## First 30 days

| Window | Deliverable | Acceptance gate |
| --- | --- | --- |
| Week 1 | Private HQ, source inventory, event collection, billing ingestion, attribution and baseline export | Owner-only access tested; duplicate/out-of-order events tested; source totals reconciled; gaps and freshness displayed; no fabricated baseline |
| Week 2 | First-session and subscription funnel, activation cohort analysis, one onboarding/paywall experiment | Signup → first workout → second workout measurable; trial cohort matured before conversion comparison; purchase/restore/refund paths tested |
| Week 3 | Structured content experiments and approval workflow | Campaign/account/content identifiers recorded; one major variable per experiment; all publish paths require approval of exact payload; API-missing metrics remain unknown |
| Week 4 | Evidence-led release, interviews, weekly report and alerts | Interview active, cancelled and inactive users; choose bottleneck from evidence; ship through reviewed PR and staging; compare mature cohorts |

## Remaining 90-day sequence

Days 31–60: validate the retention predictor, improve progress/PR/streak experiences, build the weekly shareable recap, useful opt-in lifecycle notifications and branded sharing. Test app listing changes. Ship feature flags with deterministic assignment, exposure tracking and a kill switch. Collect owned opt-in relationships. Establish cost and subscription cohort reporting. Referrals only after activation and retention are measurable and improving.

Days 61–90: repeat winning content concepts with materially different creative; adapt proven formats to Instagram and YouTube. Use source-level retained subscribers and cost to assess acquisition. Paid experiments require measured conversion, retention and a conservative cost ceiling; no automatic spending. Prove repeatability across cohorts before product #2 or a studio. Keep headcount lean, reinvest intentionally and bring in a specialist only for a demonstrated bottleneck.

## Weekly operating routine

Monday: previous complete week's growth, retention, revenue, acquisition, content, anomalies and three ranked actions. Tuesday: activation and retention. Wednesday: content experiment review. Thursday: define and preregister next experiments. Friday: reviewed release and rollback check.

Weekly report must include source freshness, metric definitions, period, comparison period and cohort maturity. Rank recommendations by evidence, expected impact and effort. No report delivery is configured by this change; do not claim a Monday schedule or notification exists until enabled and tested.

## Workstreams and dependencies

| Workstream | Scope | Depends on |
| --- | --- | --- |
| Measurement | Install/account/workout/trial/paid lifecycle, baseline, retention, attribution | Event contract and source access |
| Activation | Minimal onboarding, goal/program choice, first workout, useful progress | Baseline and observed drop-off |
| Aha moment | Compare 3 workouts, first PR, friend connection, streak against later retention | Mature cohorts; correlation is not causality |
| Monetisation | Paywall copy/placement/trial/annual experiments; renewals/failures/refunds | Verified billing ledger and exposure events |
| Retention | PRs, progress, streaks, challenges, programs, friends, competition | Usage evidence and activation guardrails |
| Lifecycle | Workout reminders, streak warnings, friend/challenge updates, recaps | Consent, preferences, quiet hours, deduplication |
| Sharing/referrals | Branded PR/workout/rank/recap cards; invite → activated user | Retention evidence; referral abuse controls |
| Content | Education, gym takes, mistakes, real transformations, stories, progress, motivation, demos | Verified product claims and creative rights |
| Experiments | Hook, slide, length, CTA, format, topic, timing; controlled follow-ups | Experiment record and comparable observation window |
| Distribution | TikTok first, then Instagram/YouTube; opted-in email/push | Winning format and channel-specific adaptation |
| Store conversion | Screenshots, subtitle, copy, preview, ratings/reviews | Listing impressions/product views/download source |
| Reliability | Backups + restore drill, secrets, logs, auth, limits, recovery | Inventory and staging environment |
| Releases | Separate dev/staging/prod; branches, commits, PRs, CI, review | Repository-specific release procedures |
| Core tests | Signup, authentication, logging, sync conflicts, subscriptions, data loss | Test accounts/data and environment isolation |
| Finance | MRR/ARR, cash, expenses, gross margin, LTV, CAC, churn, runway | Reconciled billing and expense sources; no guessed LTV |
| User research | Weekly review/support reading and active/lapsed/cancelled interviews | Theo schedules conversations; no unsolicited messages |
| Business setup | Parent/guardian involvement and UK accounting/legal advice | Professional review before company/contracts/tax decisions |
| Privacy | Data inventory/minimisation, access control, deletion/export, retention | Actual collected fields and processor inventory |

## Release boundaries

HQ foundation is a reviewable code change, not a production launch. Before deployment: check owner access, run staging integration tests with authenticated test sessions, verify no shared automation unexpectedly posts, review changes, and obtain approval for important production changes as requested. No production migration, secret change, posting, ad purchase, user outreach or unrelated-app pause occurred in this implementation.

Do not deploy the full dirty checkout: it includes unrelated unfinished publisher changes. A clean reviewed release must identify dependencies explicitly. Maintain the existing Cloudflare Worker/Supabase deployment architecture; moving the dashboard to a separate static host would break same-origin authenticated API operations without an integration design.
