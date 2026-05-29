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

Decision: The first viewport answers the user question directly with a national risk level, warning county count, top risk counties, and "pay attention today" guidance.

Rationale:

- The product goal is fast interpretation, not a raw meteorological table.
- Raw observation details still appear lower in the dashboard for credibility.

### Test the Data and Risk Core Before UI

Decision: Start TDD at the normalization and scoring layer.

Rationale:

- CWA JSON contains inconsistent object-vs-array shapes.
- A stable core makes the UI easier to polish without breaking interpretation.

### Use React/Tailwind/Recharts/Lucide

Decision: Build the frontend in Vite + React + TypeScript + Tailwind, with Lucide icons and lightweight CSS charts.

Rationale:

- Matches the user's preferred modern stack.
- Gives a more portfolio-ready implementation than a static HTML clone.
- Keeps charts and iconography maintainable.
- Avoids shipping a large chart dependency for a simple ranking bar.
