# Tasks

Status date: 2026-08-10 (Asia/Taipei)

The original portfolio-first build is superseded by the public-product mission in [`PRODUCT_STRATEGY.md`](./PRODUCT_STRATEGY.md). Historical work remains in git history and [`REVIEW_LOG.md`](./REVIEW_LOG.md).

## Iteration 1 — Warning Truth and Destination Utility

- [x] Re-audit repository, current deployment, git history, tests, data path, UX, and maintenance constraints.
- [x] Research current CWA/NCDR semantics, competing products, licensing, and GitHub scheduling limits.
- [x] Replace the nationwide “safe or risky” mission with a destination-first official-warning task.
- [x] Preserve warning affected areas and exclude expired/not-yet-effective warnings.
- [x] Add per-source live/cache/none provenance and a bounded 90-minute cache budget.
- [x] Fail closed when current warning coverage cannot be confirmed.
- [x] Remove earthquake reports and regional cyclone tracks from current weather scoring.
- [x] Put county selection, warning state, source time, action, and official link in the first viewport.
- [x] Persist selected county in the URL.
- [x] Separate official warnings, observations, and recent context records in the UI.
- [x] Complete App regression tests for loading/current/cached/unavailable and county deep links.
- [x] Complete production browser verification for desktop/mobile and failure states.
- [x] Complete independent review and post-implementation Mission review.

## Iteration 2 — Reliable Static Delivery

- [x] Require a complete 22-county warning schema before replacing the deployed cache.
- [x] Preserve the last known good artifact when warning refresh is incomplete or invalid.
- [x] Compact the fallback to the complete warning feed only, enforce a 64 KiB raw budget, and stop shipping full observation feeds.
- [x] Add lint and artifact validation to CI.
- [x] Move the scheduled job away from minute `0`; document that scheduling remains best effort.
- [x] Add an external freshness probe and a named recovery/rollback runbook.
- [ ] Consolidate duplicated browser/generator warning validators into one shared contract.
- [x] Add per-request timeout/one retry to cache generation and a 15-minute workflow job timeout.
- [x] Remove the unused legacy score/`safe`/national-answer model so it cannot regress into the UI.
- [x] Start cache and live requests concurrently without allowing a late cache result to replace live truth.

## Iteration 3 — Validate Real User Value

- [ ] Test the destination-warning task with 8–12 unfamiliar Taiwan users.
- [ ] Compare task accuracy/time against opening CWA/NCDR directly.
- [ ] Measure authority/source comprehension, official-link use, share intent, and return intent.
- [ ] Stop, narrow, or reposition the product if it does not materially improve the task.

## Launch Hardening

- [ ] Complete keyboard/screen-reader/high-zoom accessibility testing.
- [ ] Add a real Open Graph image, canonical policy, sitemap, and configurable root-domain base.
- [ ] Choose a production domain and verify DNS/HTTPS/rollback only with valid account access.
- [ ] Document privacy, incident response, data retention, dependency maintenance, and ownership.
