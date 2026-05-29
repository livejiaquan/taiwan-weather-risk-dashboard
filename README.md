# Taiwan Weather Risk Dashboard

Modern public-data dashboard for quickly understanding Taiwan's current weather risk by county/city.

The dashboard uses official Central Weather Administration (CWA) Open Weather Data to summarize active warnings, rainfall, wind, temperature, typhoon signals, and recent felt earthquakes into a user-friendly risk view.

## What It Answers

- Is Taiwan currently safe or risky?
- Which counties/cities have CWA warnings?
- What type of risk is happening?
- What should a normal user pay attention to today?

## Features

- Taiwan-wide risk overview with a direct status sentence.
- County/city risk cards sorted by interpreted risk score.
- Active weather warnings and affected-area chips.
- Rainfall, wind, temperature, typhoon, and earthquake sections.
- Region filter for north, central, south, east, and islands.
- Loading, empty, fatal error, degraded-source, and stale-source states.
- Responsive desktop/mobile layout.
- GitHub Actions workflow that refreshes a static CWA JSON cache before Pages deployment.

## Data Sources

Primary delivery path:

`https://cwaopendata.s3.ap-northeast-1.amazonaws.com/`

Datasets used:

| Dataset | Purpose |
| --- | --- |
| `Warning/W-C0033-001.json` | County-level current weather warnings |
| `Observation/O-A0002-001.json` | Automatic rainfall station observations |
| `Observation/O-A0001-001.json` | Automatic weather station temperature, wind, gusts |
| `Earthquake/E-A0015-005.json` | Significant felt earthquake county intensity |
| `Warning/W-C0034-005.json` | Tropical cyclone track information |

CWA REST API alternative:

`https://opendata.cwa.gov.tw/api/v1/rest/datastore/{dataset_id}`

The app defaults to the official AWS mirror because it is public, CORS-enabled, and does not require exposing an API token in browser code.

## Setup

```bash
npm install
npm run dev
```

Open the local URL printed by Vite.

## Verification

```bash
npm run lint
npm run test
npm run build
```

## Static Cache

Generate a cache file at `public/data/latest.json`:

```bash
npm run fetch:data
```

The browser first tries live CWA sources. If every live source fails, it attempts `/data/latest.json` as a fallback. The included GitHub Actions workflow refreshes that cache before building the Pages artifact.

## Deployment

1. Push to the `main` branch.
2. Enable GitHub Pages with GitHub Actions as the source.
3. The workflow installs dependencies, refreshes the CWA cache, runs tests, builds the app, and deploys `dist`.

## Risk Model

This project converts official data into a practical dashboard score:

- CWA warnings are weighted by phenomena such as heavy rain, strong wind, high temperature, or typhoon signal.
- Rainfall stations contribute risk based on 1-hour, 3-hour, and 24-hour maxima.
- Weather stations contribute wind, gust, and high-temperature signals.
- Recent felt earthquakes add county-specific caution when intensity is meaningful.
- Tropical cyclone tracks add awareness when recent and close enough to Taiwan.

The score is a usability layer, not an official warning level.

## Limitations

- Always follow CWA official warnings and local government emergency announcements for safety decisions.
- Some CWA datasets update only when relevant events exist; stale-source banners are intentionally conservative.
- County-level risk is derived from available stations and warning text, so local conditions can vary inside a county.

