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
- **Year-to-year yield, P50 / P90:** the yield model runs on NASA POWER's monthly data
  for every year since 2001; P50, P90 (normal approximation, empirical 10th percentile as
  a check) and a chart of each year. Warsaw at 35° S: P50 990, P90 936 kWh/kWp, 4.2%
  year-to-year variation. Weather variability only (#29).
- **Economics per kWp, in any currency:** with your investment, energy value and real
  discount rate, the app shows first-year revenue, LCOE, payback, NPV and IRR for the P50
  and the P90 yield; defaults only for degradation (0.5 %/yr) and lifetime (25 years)
  (`economics.js`, #31).
- **Horizon shading from terrain, worldwide:** on request, 577 Copernicus DEM heights
  (Open-Meteo) around the site give the skyline in 48 directions; the sun below it gives
  no beam, in every yield the app shows. Skyline within 1.1–2.0° of PVGIS, shading loss
  within 1.7 points of PVGIS on average at five mountain sites (`horizon.js`, #33).

### Changed
- The AI backend authenticates to the Claude API with workload identity federation:
  the Cloud Run service account's Google ID token is exchanged for a 10-minute Anthropic
  token, so no API key is stored in Secret Manager or anywhere else (#25).
- **Hay–Davies sky model by default** instead of the isotropic sky. Splitting the gap to
  PVGIS showed that most of the low bias for equator-facing arrays came from the
  transposition, not from NASA's data. Mean error of the 7 equator-facing cases −3.8% →
  −0.2%, mean absolute error over 11 cases 3.6% → 2.8%, Warsaw's optimal tilt 36° → 39°
  (PVGIS 39°). Yields rise by 2–7% for well-oriented arrays (Warsaw P50 990 → 1030
  kWh/kWp). East/west arrays and the terrain-shading comparison get slightly worse. The
  isotropic sky stays available as `skyModel: 'isotropic'` (#35).
- **The yield and P50/P90 now cover the same years.** The climatology behind every
  yield is the month-by-month mean of NASA POWER's monthly data for each complete year
  since 2001 (now 2001–2025), the series the P50/P90 already used, so its period is exact
  and the badge, PDF, GeoJSON (`yield_data_years`) and AI prompt name it. Before, the
  yield came from NASA's 2001–2020 climatology and sat 0.35% below the P50 at Warsaw;
  now 0.04%. Yields move by −0.6 … +0.6% at the validation sites; the mean absolute
  error against PVGIS stays 2.75%. NASA's climatology remains the fallback while the
  series loads or if it fails (#39).
- **Beam spread over the day by the Collares-Pereira & Rabl distribution** instead of
  as if the sky were as clear at sunrise as at noon. NASA's hourly data show the
  clearness index falling from 0.66 near noon to 0.45 at 5–6 h from it, so low-sun
  hours, which east and west arrays depend on, got too much beam. Against PVGIS: Lisbon
  east +5.9% → +1.9%, west +2.6% → −1.4%, mean absolute error over 11 cases 2.75% →
  2.20%. Equator-facing yields rise by 0.4–1.6% (Warsaw P50 1030 → 1043 kWh/kWp, Oslo
  now +8.4%), and the terrain-shading gap at Zermatt grows to 5.0 points. The old
  weighting stays available as `beamProfile: 'constant-clearness'`. PVGIS's remaining
  west-over-east advantage is real (clearer afternoons, in NASA's data too), not a
  time-stamp artefact, and is not modelled (#41).

### Fixed
- **README said two fixtures were 2001–2025 climatology.** NASA POWER's header has said
  "January 2001 - December 2025" since late 2026, but the values are still the 2001–2020
  means: they equal NASA's own monthly data averaged over 2001–2020 to 0.0002 kWh/m²/day
  at four sites, while 2001–2025 would differ by up to 0.11. The app's "2001–2020" label
  was right and stays; a test and `tools/check-power-period.mjs` check it (#37).

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
