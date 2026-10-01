# Warning-first interface: quality and verification

## Reading order

1. Choose a destination, then read its current warning status
2. Verify the source: official publication, direct retrieval or cache creation, and the bounded confirmation deadline
3. Read every active warning's affected areas and start/end window; upcoming windows are a separate section
4. Explore other counties, then the full official warning list
5. Read interpretation guidance, observation snapshots, separate recent records, and per-source detail

The confirmation deadline is retrieval/cache creation + 90 minutes. It is not the warning's own end time and is not a promise that upstream data will remain unchanged. The page clock still reevaluates exact warning boundaries and trust expiry; observations remain labeled snapshots. Unknown or unavailable warning feeds never become “no warnings”.

## Structure

- `src/App.tsx`: URL/region selection and dashboard composition
- `src/features/dashboard/useDashboardData.ts`: existing request-generation guard and live/cache loading ownership
- `src/features/dashboard/presentation.ts`: shared presentation mappings, official links, formatting and explanatory copy
- `components/DestinationCheck.tsx`: first-screen destination result and all active/upcoming windows
- `components/WarningRecord.tsx`: official scope/time, clearly marked local interpretation, original source link
- `components/SourceDetails.tsx`: shared provenance/time detail
- `components/CountyExplorer.tsx`: region filters and selection with focus restoration
- `components/ObservationSections.tsx`: observation snapshots and separately labeled recent records
- Remaining feature components: loading/failure states, guide, header and card primitives
- `src/lib` and `useWarningClock`: existing validation, metrics and clock contracts

React/Vite/Tailwind and source-ingestion contracts are unchanged. The newer main-branch guard excluding untimed station observations is retained.

## Craft decisions

- Chinese display/body/data roles, one h1, body 16px and essential metadata at least 14px
- Paper, teal and cobalt identity; warning/unknown/cache labels use words as well as color
- Source and validity labels stay explicit on narrow screens; long affected-area text wraps without truncation
- County/filter/refresh controls meet a 44px minimum height; selected county buttons expose `aria-pressed`
- County-card selection moves focus to the destination panel; reduced motion uses immediate scrolling
- Visible keyboard outlines, tabular timestamps, source links with adequate touch height and forced-colors selected-state outlines
- No new SDK, autoplay decoration, rankings across hazards, fabricated live timestamps or award claims

## Automated checks

Run `npm run lint`, `npm test`, `npx tsc -b`, and `npm run build`.
The suite covers the original ingestion/cache/clock/URL contracts and new multiple-warning completeness, long scopes, source deadline semantics, upcoming-card labels, source-failure wording, selected-state/focus behavior, reduced-motion scroll selection, and repeated pending refresh.

DOM tests prove structure/behavior, not pixel layout, screen-reader experience, live upstream integration or browser rendering.

## Rendered acceptance still required

This batch's cloud environment does not permit the loopback preview needed for real browser rendering. No workaround was used. These observations are **not yet verified** for this development commit:

- 320, 390, 768 and 1440px; 200% zoom; no horizontal loss or clipped text
- Mobile first-screen result, multi-warning and very long affected-area fixtures
- Actual keyboard-only navigation, focus contrast, screen-reader announcements and reduced-motion preference
- Loading, empty, cached, partial, fatal, refresh failure and repeated interaction in a real browser
- Browser console, production asset loading and performance diagnostics

Capture the exact development commit through an authorized preview before declaring visual acceptance. Production screenshots of another commit cannot substitute. Publication to a development branch does not deploy this interface.
