# Review Log

## 2026-05-30 - Initial Project Review

### Context Checked

- Target folder `/Users/jiaquan/taiwan-weather-risk-dashboard` was empty and not a Git repository.
- Reference project found at `/Users/jiaquan/Development/acc/taiwan-reservoir-static`.
- Reference design uses Noto Sans TC, bright gradient header, public-data cards, soft shadows, stat cards, chart sections, warning cards, and a source-heavy footer.
- Official CWA dataset pages and AWS OpenData mirror were checked.

### Initial Risks

- CWA JSON shapes are inconsistent: `hazards` and affected areas may be null, object, or array.
- Direct CWA REST API requires an authorization token; frontend code must not expose secrets.
- Weather warnings may update irregularly; stale logic must be per-source and contextual.
- Earthquake data can be useful but should not dominate current weather risk unless recent.

### Review Actions

- Chose AWS OpenData mirror as public default.
- Chose test-first implementation for parser/risk engine.
- Added explicit tasks for degraded data states, stale data, and responsive browser verification.

### Next Review Checkpoint

After Phase 2 and Phase 3 core data/risk implementation:

- Confirm tests cover CWA shape variance.
- Confirm stale and partial-source behavior.
- Confirm county risk output is explainable in user language.

## 2026-05-30 - Build Completion Self-Review

### Implementation Reviewed

- Data adapter normalizes CWA warning, rainfall, weather, earthquake, and tropical cyclone payloads.
- Risk engine produces national status, sorted county cards, active warning reasons, and attention guidance.
- Client loader handles successful, partial/degraded, cache fallback, and fatal source states.
- UI includes first-viewport risk answer, stat cards, ranking bars, region filters, warning details, weather signal sections, and source footer.
- README, GitHub Pages workflow, cache script, and required tracking docs are present.

### Issues Found and Fixed

- Vite/Vitest config type mismatch fixed by splitting `vite.config.ts` and `vitest.config.ts`.
- TypeScript optional-property inference errors fixed in parser normalizers.
- ESLint DOM global errors fixed.
- Recharts removed after browser console produced chart layout warnings; replaced with CSS ranking bars.
- Missing favicon fixed with inline SVG data favicon.
- Initial load changed to cache-first so the first viewport can answer quickly, then live CWA sources refresh in the background.

### Verification Evidence

- `npm run lint`: passed.
- `npm run test`: 3 test files, 10 tests passed.
- `npm run build`: passed, final JS bundle about 238.82 kB before gzip and 73.57 kB gzip.
- `npm run fetch:data`: wrote `public/data/latest.json` with 5/5 CWA sources.
- Browser desktop screenshot: `output/playwright/desktop.png`.
- Browser mobile screenshot: `output/playwright/mobile.png`.
- Browser console after final live reload: 0 errors, 0 warnings.
- Failure state verified by forcing CWA and cache requests to fail; fatal error panel and per-source failures rendered.
- Cache-first browser check: first viewport rendered the national risk answer in the initial Playwright open snapshot.

## 2026-08-10 - Trust-First Product Revalidation

### Mission and External Evidence

- Rejected the nationwide “Is Taiwan safe?” framing and the uncalibrated cross-hazard score as the primary product.
- Reframed the task around one selected county/city, currently effective CWA warnings, affected sub-areas, validity times, provenance, a concrete next step, and an official verification link.
- Rechecked CWA warning, observation, earthquake, and tropical-cyclone semantics; NCDR alert products; CWA reuse rules; and GitHub scheduled-workflow limits.
- Recorded the evidence, alternatives, guardrails, and unproven differentiation hypothesis in `PRODUCT_STRATEGY.md`.

### Baseline Product Risks Reproduced

- Expired warnings remained active because parsed validity times were not enforced.
- A warning-source failure could merge an old cache with other live sources and still produce a complete-looking current snapshot.
- Source fetch time, official update time, and cache generation time were not distinguishable in the primary answer.
- The public first viewport foregrounded an unbounded score and nationwide conclusion; county selection was not shareable in the URL.
- On a 390 × 844 viewport, the destination warning details and action were initially below the first viewport.

### Corrections Reviewed

- Added a 90-minute cache budget, live/cache/none provenance, per-source times, `no-store` fetches, and fail-closed partial-source behavior.
- Required exact canonical 22-county coverage plus complete hazard, validity-window, and affected-area schema before accepting a warning feed.
- Filtered expired and not-yet-effective warnings; removed earthquake reports and regional cyclone tracks from current weather scoring.
- Replaced the first-screen score with destination selection, official warning semantics, source status, affected areas, action guidance, and direct official links.
- Made the selected county shareable through `?county=` and restored it across reload, browser Back, and invalid URL input.
- Made warnings the only critical static-cache source, while recording unavailable observation/context sources without replacing truth with mock data.

### Verification Evidence

- `npm run lint`: passed.
- `npm run test`: 5 files, 70 tests passed.
- `npm run build`: passed; final assets `index-DDxo0VKY.js` and `index-6niwb6db.css`.
- Isolated live cache-contract smoke test: 5/5 CWA sources fetched; warning feed covered 22 counties and passed the strict schema gate; repository cache was not modified.
- Fresh production-build browser matrix: 49/49 checks passed across 1440 × 900 and 390 × 844, including happy, current-warning, partial-warning, stale-cache, incomplete-cache, fatal, URL selection/Back, overflow, page errors, and console output.
- Keyboard/focus follow-up: 13/13 checks passed.
- Current-warning mobile first viewport contained warning title, full validity window, affected area, and site action; screenshot: `/tmp/twrd-final-browser-v2/current-warning-mobile-390.png`.
- Fatal-state stable recapture confirmed complete 390 × 844 rendering with zero horizontal scroll or transforms; screenshot: `/tmp/twrd-final-browser-v2/fatal-stable-a-mobile-390.png`. An earlier clipped tool preview was an image-viewer decoding artifact, not a product defect.
- Independent architecture and testing reviews found no P0/P1 correctness blocker. Remaining P2 work is tracked in `TASKS.md`.
- Independent post-implementation Mission review passed Gates A–E for this truth/destination iteration only.

### Outcome Boundary

This iteration establishes the warning truth and destination-first foundation. It does not prove that unfamiliar users prefer this product to CWA/NCDR, that the 90-minute fallback budget is optimal, or that GitHub Pages/Actions meets a long-term public-service freshness target. Custom-domain launch and production readiness remain explicitly unclaimed.
