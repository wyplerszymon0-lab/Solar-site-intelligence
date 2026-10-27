# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- AI report without your own API key: a Node backend on Google Cloud Run (`server/`)
  owns the prompt, streams Claude Haiku 5.5's answer and enforces 50 reports a day
  (Firestore), 10 per visitor, request size limits and an origin check; the key is in
  Secret Manager. One report costs about $0.0011 (#21).
- **Clear data** button: back to the start screen, and the auto-restored last session is
  forgotten so a reload stays empty; saved analyses and settings stay (#23).
- **Projected survey coordinates:** CSV files with `easting`/`northing` (or `x`/`y`) in
  UTM (any zone, north or south), PL-1992, PL-2000 zones 5–8 or PT-TM06 are converted
  to lat/lon on load (`crs.js`, Krüger series, checked against PROJ to 0.1 mm). A wrong
  zone or swapped columns is reported instead of plotted (#27).

### Changed
- The AI backend authenticates to the Claude API with workload identity federation:
  the Cloud Run service account's Google ID token is exchanged for a 10-minute Anthropic
  token, so no API key is stored in Secret Manager or anywhere else (#25).

## [1.0.0] - 2026-10-01

First tagged release.

### Added
- **Energy yield from satellite irradiance**: monthly and annual kWh/kWp from
  20 years of NASA POWER climatology, isotropic-sky transposition, temperature
  derating and glass reflection losses (`solar-model.js`). Validated against
  PVGIS on 11 cases: mean absolute error 3.6% (the previous latitude-only
  formula: 15.5%). (#10)
- Climate-specific optimal tilt, found numerically.
- **Annual yield vs tilt chart** marking the optimum and the surveyed tilt with
  its share of the optimum. (#13)
- Orientation card comparing the surveyed orientation with the site's optimum.
- European Excel CSVs: semicolon separators, decimal commas, UTF-8 BOM and
  common header aliases. (#2)
- `node --test` suite (27 tests) and a GitHub Actions workflow.

### Changed
- CSV parsing moved to `csv.js` and survey geometry to `geometry.js`, both
  testable in Node. (#2, #12)
- Zoom control moved so it no longer covers the site badges.

### Fixed
- **The map showed "API KEY REQUIRED"** for every visitor after CARTO started
  requiring a key; switched to OpenStreetMap tiles.
- **Average azimuth** was an arithmetic mean, so 350° and 10° averaged to 180°;
  north-facing southern-hemisphere sites got a wrong compass and a ~19% lower
  yield. Now a circular mean.
- **Semicolon CSVs were silently misread** (`38,7223;-9,1393;145` became
  lat = lon = elevation = 38). (#2)
- **Outlier detection could never fire on 4–5 points** (mean ± 2σ is bounded by
  (n−1)/√n σ); now a median/MAD modified z-score. (#12)
- AI reports: `max_tokens` too low for models that think first, unescaped model
  output rendered as HTML, and silent failures on refusals or stream errors.

## Earlier development (2026-03 to 2026-09)

Interactive Leaflet map with clustering and heatmap, site statistics, rating,
shading and outlier heuristics, charts, saved analyses, CSV/GeoJSON/PDF exports,
share links, EN/PL interface and an AI site report with follow-up chat.

[1.0.0]: https://github.com/wyplerszymon0-lab/Solar-site-intelligence/releases/tag/v1.0.0
