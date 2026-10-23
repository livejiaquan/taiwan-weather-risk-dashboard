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

### Keep the Static Fallback Warning-Only

Decision: A complete, validated warning feed is the only payload persisted in the static fallback. Rain, weather-station, earthquake, and regional-cyclone raw feeds are fetched only by the browser live path and remain unavailable when that path fails.

Rationale:

- The primary user outcome is the destination warning answer; observations and recent records are explicitly secondary context.
- The previous 2.0 MB raw artifact was 96.8% observation data while the warning feed itself was about 6 KB.
- Removing optional feeds from cache reduces cold-load transfer and JSON parsing, avoids blocking warning publication on unrelated sources, and makes a strict artifact-size budget practical.

Tradeoff:

- During a live-source outage, the product can retain recent warning truth but observation cards show unavailable rather than historical values.
- Cache remains an availability fallback, not current confirmation; an empty cache still cannot prove that no warning exists.

### Bound Warning Cache Generation

Decision: Each generator request has an eight-second timeout and one retry only for network failure, timeout, or HTTP 5xx. HTTP 4xx and schema failures are not retried. The Pages build and deploy jobs have 15- and 10-minute timeouts.

Rationale:

- An unbounded upstream request could prevent the last-known-good warning artifact from being refreshed or leave an Actions job running for the platform default of six hours.
- Retrying only transient classes improves recovery without repeatedly accepting or requesting structurally invalid data.

Tradeoff:

- A valid but unusually slow upstream response can miss one refresh cycle.
- GitHub scheduling is still best effort; these bounds do not replace independent freshness monitoring.

Warning `sent` is retained as CWA issuance metadata, not treated as a fixed-interval heartbeat. A successful direct fetch of the canonical 22-county feed is marked direct at the site's fetch time; cache fallback is bounded by its generation time; individual warnings are shown only within their official validity windows. This avoids inventing an arbitrary `sent` age limit that could hide an unchanged but still-valid warning.

### Remove the Dormant Composite Risk Model

Decision: Remove county `safe`/level/score/reasons, national score/answer, and generated attention copy from the runtime snapshot. Keep effective official warnings, warning county count, observation metrics/rankings, and explicitly separated recent context.

Rationale:

- The UI no longer used these fields, but retaining them made it easy for a future change to reintroduce an uncalibrated safety claim.
- Deleting the model aligns the executable contract—not only the visible copy—with the destination-first mission.

Tradeoff:

- Historical score consumers would break, but no current runtime, persistence, or public API consumer exists.
- The repository name and some internal type names remain historical; renaming them is not required for semantic safety.
