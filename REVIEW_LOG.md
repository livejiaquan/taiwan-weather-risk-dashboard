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
