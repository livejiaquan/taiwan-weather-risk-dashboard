# Product Strategy and Research Baseline

Last updated: 2026-08-10 (Asia/Taipei)

## 1. Research Question

What public product can this repository credibly provide that helps a person in Taiwan make a real near-term decision, remains clearly distinct from official warning authorities, and fails safely when data is delayed or unavailable?

## 2. Scope and Context

This review covered the current repository and public deployment, the Central Weather Administration (CWA) warning and observation products, the NCDR public alert ecosystem, GitHub Pages/Actions constraints, and the existing product flow on desktop and mobile.

The prior framing — “Is Taiwan currently safe or risky?” — is rejected. A single nationwide score cannot faithfully represent place-specific warnings, warning validity windows, source failures, or the different meanings of weather observations, tropical-cyclone tracks, and earthquake reports.

## 3. Key Findings

1. **Official warnings already contain the decision-critical semantics.** CWA `W-C0033-001` provides county, phenomenon, significance, start time, end time, and affected sub-areas. The product should preserve those fields instead of obscuring them behind an additive score.
2. **A successful fetch does not make every record a current hazard.** Warning validity must be checked against `startTime` and `endTime`. An earthquake message marked `Actual` is a real report, not a statement that risk remains active.
3. **A tropical-cyclone track is not a Taiwan typhoon warning.** `W-C0034-005` contains all active cyclones in the western North Pacific and South China Sea. The official Taiwan typhoon-warning product is a different CAP dataset.
4. **Fallback data needs an explicit safety budget.** A cache can improve availability only when its generation time, source, and age remain visible and bounded. An expired cache must never support a “safe” or “no warning” claim.
5. **The current differentiation is unproven.** CWA already provides a location-aware app and official warning pages; NCDR already aggregates multi-agency alerts. A plausible gap is a no-install, shareable, destination-first explanation of active official warnings, but this remains a hypothesis until tested with unfamiliar users.
6. **GitHub Actions is best-effort infrastructure.** Scheduled jobs can be delayed or dropped, and public-repository schedules are disabled after 60 days without activity. The schedule cannot be treated as a freshness SLA.

## 4. Evidence Summary

- [CWA county warning product description](https://opendata.cwa.gov.tw/opendatadoc/Warning/W-C0033-001.pdf): current county warnings include validity times; updates depend on weather conditions; intended users include the public.
- [CWA heavy-rain warning definitions](https://www.cwa.gov.tw/V8/C/P/Warning/W26.html): official rainfall thresholds and warning context.
- [CWA land strong-wind warning page](https://www.cwa.gov.tw/V8/C/P/Warning/W25.html): official alert levels and concrete protective actions.
- [CWA rainfall dataset](https://opendata.cwa.gov.tw/dataset/observation/O-A0002-001): observations update every 10 minutes and include 1-, 3-, and 24-hour rainfall.
- [CWA tropical-cyclone track description](https://opendata.cwa.gov.tw/opendatadoc/Warning/W-C0034-005.pdf): the feed covers all active regional cyclones and carries forecast uncertainty.
- [CWA official apps](https://opendata.cwa.gov.tw/application/app): existing products already provide location-aware weather and warning notifications.
- [NCDR public warning API](https://alerts.ncdr.nat.gov.tw/web/developer/alerts-api) and [CAP documentation](https://alerts.ncdr.nat.gov.tw/web/developer/cap-docs): multi-agency alert aggregation exists and has its own access and integration requirements.
- [GitHub scheduled workflow limits](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule): schedules may be delayed/dropped and can be disabled after repository inactivity.
- [CWA Open Data usage rules](https://opendata.cwa.gov.tw/about/rules): reuse is permitted under the platform rules, with attribution requirements compatible with CC BY 4.0.

## 5. Comparative Analysis

| Product | Strongest user value | Limitation relevant to this project |
| --- | --- | --- |
| CWA website / app | Authoritative weather, warnings, location and push notifications | Rich official surface; sharing one concise destination status is not its only job |
| NCDR WATCH / public alerts | Broader multi-agency hazard coverage | Integration, semantics, and access are substantially more complex than one weather-warning view |
| Current dashboard | One-page county comparison and public source visibility | Uncalibrated score, mixed hazard semantics, unclear cache provenance, and no destination-first answer |
| Proposed product | Shareable, no-install, county-first active-warning explanation with visible freshness | Must prove that users prefer it to opening the official products directly |

## 6. Trade-offs

- **Truth over apparent completeness:** showing “cannot confirm” during critical-source failure is less satisfying but safer than manufacturing a complete national status.
- **Official semantics over one score:** separate warning types take more space but remain explainable and actionable.
- **Freshness over offline continuity:** rejecting old caches can reduce availability; it prevents historical hazards from being presented as current.
- **Focused weather scope over premature multi-hazard breadth:** broader coverage could be valuable later, but only after each authority, validity rule, and user action is modeled independently.

## 7. Recommended Approach

### Mission

Help a person who is about to commute, go out, or travel to a Taiwan county/city understand within five seconds:

1. which **currently valid official CWA warnings** affect that destination;
2. which sub-areas and validity window the warning actually covers;
3. how fresh the displayed source is and whether it came from live data or cache; and
4. the next protective action and direct path to the official source.

Observations may add context. They must be labelled as observations or site interpretation. This product must not declare a place “safe,” act as an emergency authority, or imply that derived content is an official risk level.

### Outcome guardrails

- When the warning source is unavailable, stale, or only cached, the primary answer is `unable to confirm`; absence of cached warnings never means no current warnings.
- Expired and not-yet-effective warnings never appear as active.
- Every primary claim exposes authority, source time, fetch/cache time, and validity status before the claim can influence action.
- Earthquake reports and regional tropical-cyclone tracks do not contribute to a current county weather score.
- A user can select one county/city in one action and share that state through the URL.

### Roadmap

#### P0 — Truth contract (current iteration)

- Add per-source provenance and bounded cache age.
- Reject stale fallback and filter warning validity windows.
- Fail closed when the warning source cannot be confirmed.
- Remove earthquake and regional cyclone-track signals from the combined score.
- Add regression tests for partial, stale, expired, loading, and error states.

#### P1 — Destination-first utility (current/next iteration)

- Put county/city selection and active official warnings in the first viewport.
- Preserve affected sub-areas and validity times.
- Add official, source-specific action copy and direct official links.
- Make selected location shareable without requiring account, GPS, or notification permission.

#### P2 — Reliable delivery

- Validate required schemas and freshness before creating a cache or deploying.
- Keep the last known good artifact instead of replacing it with a partial cache.
- Produce a compact normalized payload with provenance rather than shipping full raw feeds.
- Add independent freshness monitoring; treat GitHub cron only as a fallback mechanism.
- Add CI lint, dependency/security maintenance, and documented recovery ownership.

#### P3 — Prove product value

- Test the five-second location task with unfamiliar users.
- Compare task completion and trust against opening CWA/NCDR directly.
- Track return/share intent and the rate of users opening the official source.
- Expand to another hazard only when its authority, validity semantics, action model, and maintenance owner are explicit.

#### P4 — Public launch hardening

- Complete accessibility and mobile task testing.
- Add Chinese-first metadata, Open Graph assets, canonical/robots/sitemap policy, and a custom-domain-compatible build.
- Configure and verify a custom domain and HTTPS only when credentials and the chosen domain are available.

## 8. Alternative Approaches

1. **Keep tuning the combined score:** rejected for now because calibration, double counting, and user interpretation remain unsupported.
2. **Become a full multi-hazard portal immediately:** deferred because NCDR already occupies this space and each additional feed adds distinct authority and expiry risks.
3. **Show raw CWA tables only:** truthful but does not create enough user value beyond the official sources.
4. **Build notifications first:** potentially valuable, but it introduces permission, background delivery, and operational obligations before the core status is trustworthy.

## 9. Implementation Considerations

- Runtime validation must treat object/array polymorphism and empty-but-HTTP-200 payloads as schema cases, not success by default.
- `source published/observed at`, `site fetched at`, `cache generated at`, and `warning expires at` are separate timestamps.
- A positive warning from a recent cache may be shown only as cached and requiring confirmation; an empty cache cannot prove that no warning exists.
- UI acceptance must cover desktop/mobile, keyboard and visible focus, loading/empty/partial/fatal states, and browser console errors.
- Deployment acceptance requires lint, focused tests, full tests, production build, rendered browser checks, and validation of the generated data artifact.

## 10. Open Questions / Unknowns

- Will unfamiliar users complete the destination-warning task faster or with more confidence than on the official products?
- Which destinations should be remembered locally, if any, without creating privacy concerns?
- Is a 90-minute cache safety budget acceptable during CWA outages, or should the product show only a direct official link sooner?
- Which independent host/edge runtime can meet the future freshness and monitoring requirement without hidden credential or maintenance risk?
- What custom domain should be used? No domain or DNS authority is currently available in this repository.
