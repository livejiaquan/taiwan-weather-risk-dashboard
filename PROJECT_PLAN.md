# Taiwan Local Warning Project Plan

Status date: 2026-08-10 (Asia/Taipei)

The evidence, mission, alternatives, and source links behind this plan live in [`PRODUCT_STRATEGY.md`](./PRODUCT_STRATEGY.md).

## Target Product Outcome (Not Yet User-Validated)

An unfamiliar user can select a Taiwan county/city once and understand, within five seconds:

- whether currently valid CWA warnings are available for that destination;
- the affected sub-area and validity window;
- whether the data is live, cached, stale, or unavailable; and
- what to do next and where to verify the official notice.

The product never declares a place safe. Official warnings, observations, and site interpretation must remain visibly separate.

## Current Iteration — Trust First

### Product contract

- [x] The first viewport is destination-first, not nationwide-score-first.
- [x] Selected destination is represented in the URL and can be shared.
- [x] Active warnings retain CWA phenomenon, significance, affected areas, start time, and end time.
- [x] CWA authority and official verification link appear beside the primary answer.
- [x] Observation-derived content is explicitly labelled as site interpretation.

### Data contract

- [x] Every source exposes live/cache/none provenance and relevant timestamps.
- [x] Static cache has a bounded 90-minute safety budget.
- [x] Stale, invalid, or future-dated cache is rejected.
- [x] Expired and not-yet-effective warnings are excluded consistently.
- [x] Warning-source failure cannot produce `safe`, `normal`, or `no warning` claims.
- [x] Earthquake reports and regional tropical-cyclone tracks do not alter county weather status.

### Delivery contract

- [x] Focused tests cover source failure, stale cache, warning validity, and provenance.
- [x] UI tests cover current/cached/unavailable warning states and selected destination.
- [x] Desktop and mobile flows are visually inspected from a production build.
- [x] Keyboard behavior, visible focus, responsive reflow, and browser console are checked.
- [x] `npm run lint`, `npm run test`, and `npm run build` pass.
- [x] Independent code/product review and post-implementation Mission review pass.

## Next Iteration — Reliable Data Delivery

- [x] Define a strict runtime schema for the mission-critical warning payload.
- [x] Reject incomplete warning cache generation and retain the last known good deployment.
- [x] Reduce the fallback from full multi-source raw feeds to a warning-only artifact with a 64 KiB budget.
- [x] Add bounded generator retry/timeout, CI lint, artifact validation, and a workflow timeout.
- [x] Move the cron off minute `0` and document that GitHub schedule is best effort.
- [ ] Consolidate the duplicated browser/generator warning validator.
- [ ] Start cache and live requests concurrently with deterministic live-result precedence.
- [ ] Add an external freshness check and named recovery procedure.

## Validation Iteration — Prove Differentiation

- Recruit unfamiliar users who commute or travel between counties.
- Compare the destination-warning task against the CWA website/app and NCDR.
- Measure task completion, time-to-correct-answer, source comprehension, and confidence.
- Record whether users would share the destination link or return during severe weather.
- Stop or reposition the product if it does not outperform simply linking to the official source.

## Launch Iteration — Public Hardening

- Complete accessibility testing beyond screenshot review.
- Add Chinese-first SEO/social metadata and a real social preview asset.
- Make the Vite base path configurable for both project Pages and a root custom domain.
- Add privacy, incident, attribution, data-retention, and maintenance notes.
- Verify chosen custom domain, DNS, HTTPS, rollback, and ownership when the required account access exists.

## Deferred Until Evidence Supports It

- Additional hazards or agencies.
- Push notifications, PWA background delivery, or accounts.
- A map-first redesign.
- A new composite risk score or score calibration.
- Custom-domain configuration without a chosen domain and DNS authority.
