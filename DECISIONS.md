# Decisions

## 2026-05-30

### Use CWA AWS OpenData Mirror as Primary Browser Source

Decision: Fetch official public JSON from `https://cwaopendata.s3.ap-northeast-1.amazonaws.com/`.

Rationale:

- It is managed as the CWA OpenData public data lake.
- It exposes current JSON files without requiring a private API token in browser code.
- CORS allows browser reads.
- It supports the requested static/public dashboard deployment model.

Tradeoff:

- Dataset filenames are stable but still depend on CWA mirror availability.
- The app needs degraded states and a cache fallback for source failures.

### Keep CWA REST API as Documented Alternative

Decision: Document `https://opendata.cwa.gov.tw/api/v1/rest/datastore/{dataset_id}` as an alternate fetch path for users with `CWA_API_KEY`, but do not require it for the default dashboard.

Rationale:

- Avoids putting API keys in public frontend code.
- Makes GitHub Pages deployment simpler.
- Keeps room for GitHub Actions cache refresh using secrets later.

### Risk First, Raw Data Second

Status: Superseded on 2026-08-09 by “Replace ‘Is Taiwan Safe?’ with a Destination-First Warning Mission.” Retained here as historical context.

Decision: The first viewport answers the user question directly with a national risk level, warning county count, top risk counties, and "pay attention today" guidance.

Rationale:

- The product goal is fast interpretation, not a raw meteorological table.
- Raw observation details still appear lower in the dashboard for credibility.

### Test the Data and Risk Core Before UI

Decision: Start TDD at the normalization and scoring layer.

Rationale:

- CWA JSON contains inconsistent object-vs-array shapes.
- A stable core makes the UI easier to polish without breaking interpretation.

### Use React/Tailwind/Lucide

Decision: Build the frontend in Vite + React + TypeScript + Tailwind, with Lucide icons and lightweight CSS charts.

Rationale:

- Matches the user's preferred modern stack.
- Gives a more portfolio-ready implementation than a static HTML clone.
- Keeps charts and iconography maintainable.
- Avoids shipping a large chart dependency for a simple ranking bar.

## 2026-08-09

### Replace “Is Taiwan Safe?” with a Destination-First Warning Mission

Decision: The primary user task is to select a Taiwan county/city and see currently valid official CWA warnings, affected sub-areas, validity time, source freshness, and a direct official verification path.

Rationale:

- A nationwide score cannot represent place-specific warning semantics.
- Official products already cover broad weather and multi-hazard monitoring; the plausible product gap is a concise, shareable, no-install destination view.
- “No active warning found” is not the same as “safe,” especially during partial-source failure.

Tradeoff:

- The product will sometimes say that it cannot confirm current warnings instead of presenting a complete green dashboard.
- Differentiation remains a hypothesis until unfamiliar-user testing shows a faster or clearer task outcome than the official products.

### Make Warning Truth Fail Closed

Decision: Warning-source availability, cache age, warning effective time, and warning expiry are part of the product contract. An old or unavailable warning source cannot support a `safe`, `normal`, or `no warning` claim.

Rationale:

- Partial live success previously allowed an empty warning input to generate a complete-looking snapshot.
- Cached warning and observation payloads previously had no cache-age gate.
- `startTime` and `endTime` were parsed but not applied to active-warning calculations.

Tradeoff:

- A strict cache budget reduces fallback availability during a long upstream outage.
- Positive cached warnings may be shown only as cached and requiring confirmation; cached absence never confirms no warning.

### Separate Official Warnings, Observations, and Context Records

Decision: Earthquake reports and `W-C0034-005` regional tropical-cyclone tracks do not contribute to a county’s current weather status. Observations may provide context but do not create an official warning.

Rationale:

- The tropical-cyclone feed covers all active systems in the western North Pacific and South China Sea; it is not the Taiwan typhoon-warning product.
- A significant felt-earthquake payload is a past event report, not a current risk forecast.
- Adding correlated observations and unrelated event records produces an uncalibrated, unbounded score.

Tradeoff:

- The dashboard loses a visually simple all-in-one ranking.
- Separate hazard semantics take more space but remain traceable and explainable.

### Treat GitHub Actions Cache Refresh as Best Effort

Decision: Scheduled Pages builds may refresh a fallback cache, but they are not a freshness SLA or the sole warning delivery mechanism.

Rationale:

- GitHub documents that scheduled jobs can be delayed or dropped and that inactive public-repository schedules can be disabled.
- Observed workflow gaps are materially longer than the declared 30-minute cron interval.

Tradeoff:

- Long-term reliability requires a monitored ingestion/health path beyond a static Pages schedule.
- That infrastructure is deferred until the first user-value hypothesis and warning truth contract are validated.

## 2026-08-10

### Require a Complete County-Warning Contract

Decision: A warning payload can support a current county claim only when it contains exactly the 22 canonical Taiwan counties/cities with matching CWA geocodes, an explicit `hazardConditions` value for every county, and parseable hazard, validity-window, and affected-area structures. Any missing, duplicated, malformed, or unexpected county coverage fails closed.

Rationale:

- HTTP 200, `location: null`, or a truncated location list cannot prove that a county has no warning.
- CWA represents a valid no-warning county with an explicit county row and empty hazard conditions; completeness is therefore part of the negative-claim contract.
- The browser and cache generator must reject the same false-negative cases.

Tradeoff:

- An upstream schema or county-list change will temporarily produce `unavailable` until the contract is reviewed and updated.
- Browser and generator validators remain duplicated for this iteration and must be consolidated to prevent future drift.

### Publish Warning Cache When Context Sources Degrade

Decision: A complete, validated warning feed is the only critical requirement for publishing a new static cache. Rain, weather-station, earthquake, or regional cyclone failures are recorded as unavailable context and do not block an otherwise valid warning artifact.

Rationale:

- The primary user outcome is the destination warning answer; observations and recent records are explicitly secondary context.
- Blocking a current warning refresh because a non-warning source failed could leave the deployed warning cache older than necessary.

Tradeoff:

- Some deployments contain a complete warning view with unavailable observation cards.
- The UI and provenance contract must keep those degraded sources visible and must not infer missing observations.
