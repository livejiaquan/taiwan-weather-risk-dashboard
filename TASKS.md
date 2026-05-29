# Tasks

## Current Status

Portfolio-ready first build completed on 2026-05-30. Dev server is running at `http://127.0.0.1:5174/`.

## Phase 1: Project Foundation

- [x] Confirm target folder state.
- [x] Inspect reference dashboard design language.
- [x] Research official CWA datasets and no-key delivery path.
- [x] Initialize Git repository.
- [x] Create required tracking docs.
- [x] Add Vite/React/TypeScript/Tailwind package and config files.
- [x] Add first risk-engine tests before production implementation.
- [x] Install dependencies.
- [x] Run test command and verify the initial risk-engine tests fail for the expected missing module.
- [x] Implement first risk-engine slice and make tests pass.

## Phase 2: Data Pipeline

- [x] Add tests for parser edge cases and degraded source handling.
- [x] Define CWA endpoint metadata and source labels.
- [x] Implement warning parser for `W-C0033-001`.
- [x] Implement rainfall parser for `O-A0002-001`.
- [x] Implement weather station parser for `O-A0001-001`.
- [x] Implement earthquake parser for `E-A0015-005`.
- [x] Implement typhoon parser for `W-C0034-005`.
- [x] Implement timeout-aware fetcher and cache fallback.

## Phase 3: Risk Model

- [x] Define county list, regions, and display order.
- [x] Implement warning/rain/wind/temperature/earthquake/typhoon scoring.
- [x] Generate Taiwan-wide status answer.
- [x] Generate county ranking and daily attention guidance.
- [x] Add tests for warning shape, high-risk scoring, parser edge cases, and partial/fatal data scenarios.

## Phase 4: Dashboard UI

- [x] Implement app shell and data-loading state machine.
- [x] Implement first-viewport risk overview.
- [x] Implement county/city risk cards and region filters.
- [x] Implement active warning detail cards.
- [x] Implement rainfall, wind, temperature, earthquake, and typhoon sections.
- [x] Implement error, empty, stale, and partial-data banners.
- [x] Implement responsive mobile layout and accessibility polish.

## Phase 5: Docs and Verification

- [x] Add GitHub Actions data-cache workflow.
- [x] Finish README with data sources, setup, deployment, and limitations.
- [x] Run `npm run lint`.
- [x] Run `npm run test`.
- [x] Run `npm run build`.
- [x] Run `npm run fetch:data`.
- [x] Run local dev server.
- [x] Inspect UI in browser desktop viewport.
- [x] Inspect UI in browser mobile viewport.
- [x] Verify failure states.
- [x] Update `REVIEW_LOG.md` with final self-review.
