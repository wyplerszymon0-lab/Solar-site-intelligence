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
- **Terrain from the survey.** A least-squares plane through the surveyed heights gives the
  site's slope, the direction it falls towards, its north–south and east–west grade and the
  RMS of the heights about it (a "Terrain" card, the AI prompt and five GeoJSON fields).
  Local metres from the WGS84 radii agree with pyproj's tangent plane to 2 mm on a 3 km site,
  and the plane matches numpy; points along one line give no plane (#63).
- **Rows on sloping ground.** Row spacing, row count, capacity and site economics follow the
  terrain plane's north–south grade: the GCR scales by 1 + grade / tan(winter noon sun),
  about ±20% for ±5% in Warsaw. Checked against pvlib's shaded fraction at 24 cases. The GCR
  is capped at 1, which also fixes an error for steep panels near the equator (#65).
- **Bifacial modules.** A bifaciality setting adds the rear side of the fixed rows: a 2-D
  infinite-sheds view-factor model (sky through the gap, the partly shaded ground, low sun
  from behind) over the mean day, within 0.03% of pvlib's rear irradiance at 7 sites, 12
  months and 4 row geometries. Shown on a Bifacial card, in the AI prompt and the GeoJSON;
  capacity energy, economics and P90 stay monofacial (#67).
- **Bifacial P50 / P90 and economics.**
  - The rear side is computed for every year since 2001, which gives a bifacial P50 / P90 and the site's bifacial energy.
  - The economics table shows how much more per kWp bifacial modules may cost and still match the monofacial NPV, at P50 and the 10-year P90. Warsaw at 39°: +107 / +102 kWh/kWp a year to pay for it.
  - An optional extra investment adds bifacial P50 and P90 columns.
  - The rear model's own uncertainty is not in the P90 (#69).
- **Ground albedo setting.** Choose the ground under the rows from pvlib's surface table (grass 0.20, the default;
  fresh grass, bare soil, sand, concrete, urban) or enter a measured value. It applies to every yield, the tracker and
  the P50/P90. The Bifacial card shows what +0.1 of albedo adds. Warsaw at 39°: the bifacial gain goes from +10.3%
  on grass to +17.4% on sand (#71).

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
- **P90 with the uncertainty of the estimate, for 1 and 10 years.** The weather's
  year-to-year σ (divided by √10 over ten years) and a 3.8% uncertainty of the estimate
  itself (the model's RMS error against PVGIS at seven sites; 2.3% without Oslo) add in
  quadrature. The P90 card shows the 1-year P90 (Warsaw 35° S: 965 kWh/kWp, was 984
  weather-only), the tooltip the weather-only and 10-year P90 (989), and the economics
  use the 10-year P90 instead of a bad year every year. AI prompt and README explain
  which is which and what is still left out (#43).
- **Capacity of the whole site:** kWp = area × usable share × ground coverage ratio ×
  module efficiency, with the GCR from the existing no-shading-at-winter-noon row
  spacing, 1 / (cos β + sin β / tan α), so the row height cancels out (`capacity.js`).
  A card shows MWp (DC) and MWh a year at P50 / 1-year P90, the economics table the
  site's investment, energy, revenue and NPV, and GeoJSON, PDF and AI prompt include
  it. Module efficiency (default 21%) and usable share (default 100%, gross) are
  settings. Rows and capacity now use the same tilt as the yield (#45).
- **AI models with your own key: Claude Opus 5.5, Sonnet 5.5 (default) and Haiku 5.5**
  instead of Opus 5, Sonnet 5 and Haiku 4.5: Opus 5.5 is cheaper ($4 / $20 vs $5 / $25
  per million tokens) and Haiku 5.5 ten times cheaper than Haiku 4.5 ($0.10 / $0.50).
  The request sends no thinking, sampling or prefill fields (the new models reject
  them) and replays only text, so follow-up questions pass the history-editing check;
  the refusal fallback now covers Opus 5.5 and Sonnet 5.5. Model list and request body
  moved to `claude-request.js`, with tests (#47).
- **Single-axis tracker alternative:** the yield of an ideal tracker on a horizontal
  north–south axis (no rotation limit, backtracking or row shading, as in PVGIS) and its
  gain over the best fixed array, on a card, in GeoJSON and in the AI prompt (Warsaw
  +17.8%, Lisbon +26.8%). `monthlyYield` takes `mounting: 'single-axis'` and an optional
  `trackerLimit`; sky and ground view factors follow the rotation over the day. Against
  PVGIS at the seven validation sites: 5.6% RMS error, gain overrated by 3.3 points on
  average (14 with constant clearness), so the card is labelled an upper estimate (#49).
- **Where the tracker overshoot comes from**, with PVGIS's hourly data at Lisbon, Warsaw
  and Johannesburg: the model puts 4.1–4.6% of the year's DNI below 5° of sun elevation,
  PVGIS 0.9–1.2%, while above 20° they agree. Hottel's clear-sky beam shape fixed the
  tracker (+0.5% mean) but made fixed arrays worse, so the model is unchanged; README
  records both alternatives, a test the evidence (#51).
- **Tracker rows with backtracking, and the tracker layout's capacity.** Rows at a
  ground coverage ratio (setting, default 0.33, the middle of Bolinger & Bolinger's
  0.25–0.40 for tracking plants) turn back towards flat at low sun so they do not shade
  each other. The rotation matches pvlib's `singleaxis` to 5·10⁻⁵° at 1700 sun
  positions. An optional rotation limit is a setting too. The tracker card adds MWp and
  MWh for the site; GeoJSON and AI prompt include GCR, limit, capacity and energy.
  Warsaw at GCR 0.33: 1138 kWh/kWp, +8.9% over the fixed array, −7.6% for
  backtracking, a loss the model overstates because of its low-sun beam (#51) (#53).
- **Tracker economics without a guessed premium.** The economics table shows the
  break-even extra investment: how much more per kWp a tracker may cost before its NPV
  falls to the fixed array's (NPV is linear in the investment, so it is the difference of
  the two NPVs). Optional inputs for the tracker's actual extra investment and O&M add a
  tracker column (LCOE, payback, NPV, IRR) and the tracker layout's whole-site rows at
  its own MWp. Berkeley Lab sources disagree on the premium's sign over the years, so
  there is no default (#55).
- **Hourly data against the mean day, same year as PVGIS (study, model unchanged).**
  `hourlyYield`, `sunPosition` and `parsePowerHourly` in `solar-model.js` run the same
  physics hour by hour on NASA POWER hourly data. NASA's hourly values belong to the hour
  starting at their stamp, measured from the GHI centroid at seven sites (26–32 min before
  solar noon at HH:00). Against PVGIS seriescalc 2020 at seven sites and four mountings,
  hourly data fix the tracker (mean error +4.9% → −2.8%) and the low-sun DNI (0.9–1.1%
  below 5°, PVGIS 0.9–1.2%), but fixed arrays get slightly worse, so over 28 cases the
  mean day stays closer (MAE 3.66% vs 3.98%) and the app keeps it (#57).
- **Hourly study: NASA's beam/diffuse split ruled out (study, model unchanged).**
  NASA's hourly DNI·cos Z + DHI closes on GHI within 3% at seven sites, and an Erbs (1982)
  re-split, checked against pvlib, does worse (fixed arrays MAE 3.74% vs 3.61%; mean day
  2.94%). The gap on fixed arrays is mostly the T + 20 °C rule applied to warm daylight
  hours (1.5–5.7 °C above the monthly mean): without the temperature term, hourly data and
  the mean day agree within 0.2% on equator-facing arrays (#59).
- **Hourly study: module temperature and power as PVGIS (study, app unchanged).**
  `hourlyYield` options `moduleTemp: 'faiman'` (PVGIS's c-Si U0 26.9, U1 6.2, NASA hourly
  WS10M) and `power: 'huld'` (Huld 2011, PVGIS 5 c-Si), checked against pvlib. Both bring
  hourly data closer to PVGIS 2020 than T + 20 °C (Faiman: MAE 3.37% over 28 cases, against
  3.98%) and beat the mean day over all 28 (3.66%), but not on fixed arrays (3.33% and 3.40%
  against 2.94%), so the app keeps the mean day (#61).

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
