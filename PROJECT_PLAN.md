# Taiwan Weather Risk Dashboard Project Plan

## Objective

Build a polished GitHub side project that helps a normal user understand Taiwan's current weather risk within 5 seconds:

1. Is Taiwan currently safe or risky?
2. Which counties and cities have warnings?
3. What type of risk is happening?
4. What should someone pay attention to today?

## Source Research

Primary source: Central Weather Administration (CWA) Open Weather Data.

Useful official datasets found:

- `Warning/W-C0033-001.json`: county-level current weather warning status. Covers heavy rain, land strong wind, dense fog, and typhoon warning signals by county.
- `Warning/W-C0033-002.json`: warning content grouped by warning type and affected regions.
- `Warning/W-C0033-003.cap` / `.json`: heavy rain CAP information.
- `Warning/W-C0033-005.cap`: high temperature information.
- `Warning/W-C0034-001.cap`: typhoon warning CAP.
- `Warning/W-C0034-005.json`: tropical cyclone tracks.
- `Observation/O-A0002-001.json`: automatic rainfall stations, including 10-minute, 1-hour, 3-hour, 6-hour, 12-hour, 24-hour, 2-day, and 3-day rainfall.
- `Observation/O-A0001-001.json`: automatic weather stations, including current weather, temperature, wind speed, gusts, humidity, and pressure.
- `Earthquake/E-A0015-005.json`: significant felt earthquake county/town intensity report.
- `Earthquake/E-A0073-001.json`: current-year earthquake catalog, useful later for history.

Delivery source choice:

- Use the official CWA AWS OpenData mirror first: `https://cwaopendata.s3.ap-northeast-1.amazonaws.com/{category}/{dataset}`. It supports CORS with `Access-Control-Allow-Origin: *`, so the browser can fetch it without a private API key.
- Keep a `scripts/fetch-cwa-data.ts` cache path and GitHub Actions workflow as a reliability fallback, so the project can later pin public JSON in `public/data/latest.json`.
- Document CWA REST API usage for users who prefer API-key-backed fetching: `https://opendata.cwa.gov.tw/api/v1/rest/datastore/{dataset_id}`.

## Design Direction

Reference: local `livejiaquan/taiwan-reservoir-static` project at `/Users/jiaquan/Development/acc/taiwan-reservoir-static`.

Adapted design language:

- Public-data dashboard feel with a bright header, big readable numbers, cards, soft shadows, and semantic status colors.
- Use the same practical structure: update metadata, overview stat cards, charts/rankings, regional cards, alert details, and footer source notes.
- Weather-specific changes: risk-first hierarchy, danger/elevated/safe semantics, "what to watch today" guidance, and county comparison.
- Avoid directly copying CSS or content. Implement in React/TypeScript/Tailwind with compact cards and responsive layouts.

## Product Architecture

- Vite + React + TypeScript frontend.
- TailwindCSS for styling and responsive layout.
- Recharts for compact rankings and risk distribution visuals.
- Lucide icons for accessible icon buttons and section signals.
- CWA data adapter layer normalizes inconsistent official JSON shapes.
- Risk engine converts warnings + rainfall + wind + temperature + typhoon + earthquake into county summaries and national status.
- UI renders loading, empty, recoverable error, fatal error, success, and stale/degraded data states.

## Phase Plan

### Phase 1: Project Foundation

- Initialize repository.
- Create `PROJECT_PLAN.md`, `TASKS.md`, `DECISIONS.md`, `REVIEW_LOG.md`.
- Scaffold Vite React TypeScript Tailwind project.
- Add test runner, linting, build config.
- Add test-first risk-engine expectations.

### Phase 2: Data Pipeline

- Implement CWA endpoint definitions.
- Implement fetcher with timeout, per-source error capture, stale metadata, and fallback to bundled sample/cache.
- Implement CWA parsers for warnings, rainfall stations, weather stations, typhoon summary, and earthquake intensity.
- Implement normalized app snapshot.

### Phase 3: Risk Model

- Implement county list and regions.
- Score weather warnings by severity and phenomena.
- Score observed rainfall, wind/gust, temperature, typhoon proximity, and recent earthquake intensity.
- Generate national answer, county rankings, risk reason chips, and today guidance.

### Phase 4: Dashboard UI

- Header with Taiwan-wide risk answer, update time, stale-data warning, and refresh action.
- Stat cards for active warning counties, highest rainfall, strongest gust, highest temperature, latest earthquake/typhoon context.
- County/city risk card grid with filters and ranking.
- Active warnings detail section.
- Rainfall, wind, temperature, earthquake, and typhoon sections.
- Loading, empty, recoverable error, fatal error, stale/degraded states.

### Phase 5: Polish and Portfolio Readiness

- Responsive desktop and mobile browser review.
- Long text and Chinese typography review.
- README with data source, setup, deployment, limitations, and GitHub Actions cache instructions.
- Build/lint/typecheck/test verification.
- Self-review log update.

## Success Criteria

- A user can see national risk, warning counties, risk type, and daily attention points in the first viewport.
- County cards show county-level status with reasons, not just raw data.
- The app works with official CWA public data and degrades when a source fails.
- Loading, empty, error, and stale states are visible and meaningful.
- Desktop and mobile layouts are visually polished.
- `npm run lint`, `npm run test`, and `npm run build` pass before completion.

