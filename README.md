# Solar Site Intelligence Dashboard

> AI-powered geodetic data analysis tool for photovoltaic site assessment

**[Live Demo →](https://wyplerszymon0-lab.github.io/Solar-site-intelligence/)**

---

## Overview

This project was born from hands-on experience conducting geodetic surveys for photovoltaic installations during an Erasmus+ internship in Portugal. The goal was to automate the analysis process that surveyors typically do manually — turning raw measurement data into actionable installation recommendations.

Upload your geodetic CSV, visualize measurement points on an interactive map, and get an AI-generated site assessment in seconds.

## Features

**Map & site geometry**
- **Interactive map visualization** — measurement points on a dark-themed Leaflet map, color-coded by solar potential (good / mid / poor)
- **Marker clustering & heatmap view** — large surveys (150+ points) auto-cluster; a Markers/Heatmap toggle switches the map view
- **Site boundary overlay** — convex hull drawn around the survey points, used for an accurate area estimate instead of an inflated bounding-box guess

**Site statistics & analysis**
- **Hemisphere-aware facing** — south- or north-facing recommendation, correct on both sides of the equator (azimuths are averaged as angles, so 350° and 10° average to 0°, not 180°)
- **Energy yield from satellite irradiance** — annual and monthly kWh/kWp computed from 20 years of NASA POWER satellite data for the exact site, at the surveyed tilt and azimuth (see [Yield model](#yield-model))
- **Climate-specific optimal tilt** — the equator-facing tilt that maximises annual yield for this site's climate, found numerically instead of a latitude rule of thumb
- **Orientation check** — how much yield the surveyed orientation loses versus the optimum at the same site
- **Row-spacing / panel-count estimate** — suggested row spacing and how many rows fit the site, sized to avoid self-shading near the winter solstice
- **Shading-risk & outlier flags** — heuristic per-point flags for a taller nearby neighbor on the sun side, or a statistically anomalous elevation reading
- **Site charts** — rating distribution, elevation profile, per-point slope, azimuth compass rose, and monthly yield, all inline SVG

**AI analysis**
- **AI site report** — Claude analyzes your data and returns a structured report (panel configuration, risk factors, recommendations). **No API key needed:** without one, the report comes from a small backend on Google Cloud Run (Claude Haiku 5.5, limited per day); see [AI backend](#ai-backend-google-cloud-run)
- **Follow-up chat** — ask follow-up questions about the report in the same conversation
- **Model picker** — with your own key, choose Opus 5, Sonnet 5, or Haiku 4.5 depending on quality/speed/cost needs

**Data in & out**
- **Saved analyses** — name and save analyses locally (`localStorage`) and reload them later from this browser
- **Auto-restored last session** — reopening the page restores your most recent analysis; **Clear data** returns to the empty start screen and forgets it (saved analyses stay)
- **Exports** — CSV (with ratings/flags), GeoJSON (points + a site boundary polygon carrying the annual and 12 monthly yield values and their source, `nasa_power` or `heuristic`), a printable PDF report with the monthly yield table, and a shareable link that encodes the dataset in the URL (no server involved)
- **Optional local key storage** — the API key can be remembered in this browser only (opt-in, off by default)

**Other**
- **Bilingual UI** — English / Polish toggle; the AI is also asked to respond in the selected language

## Demo

Click **"Load Demo Data (Portugal)"** to instantly load 10 sample measurement points from the Lisbon region — no CSV required.

## CSV Format

The tool accepts CSV files with the following columns:

```csv
lat,lon,elevation,slope,azimuth
38.7223,-9.1393,145,12,175
38.7225,-9.1390,147,11,178
```

| Column | Required | Description |
|--------|----------|-------------|
| `lat` | ✅ | Latitude (decimal degrees) |
| `lon` | ✅ | Longitude (decimal degrees) |
| `elevation` | optional | Elevation above sea level (meters) |
| `slope` | optional | Terrain slope / panel tilt angle (degrees) |
| `azimuth` | optional | Panel orientation (degrees, 180° = south, 0°/360° = north) |

Semicolon-separated files with decimal commas (what Excel saves in Polish, German, Portuguese and most other European locales) work too, as do common header variants such as `Latitude`, `lng`, `Altitude`, `Tilt` or `Bearing`. Rows with invalid values are skipped and listed; values with units attached (`145m`) are rejected rather than guessed.

> Ratings and yield estimates are hemisphere-aware: sites north of the equator are scored against a south-facing (180°) optimum, sites south of the equator against a north-facing (0°) optimum.

### Projected coordinates (UTM, national grids)

Survey instruments usually export plane coordinates, not lat/lon. Pick the file's system under **Coordinates in the file** and use `easting`/`northing` (or `x`/`y`, `E`/`N`) columns instead of `lat`/`lon`:

| System | Where | EPSG |
|--------|-------|------|
| UTM zones 1–60, north or south (WGS84) | anywhere from 80° S to 84° N | 32601–32660, 32701–32760 |
| PL-1992 | Poland | 2180 |
| PL-2000 zones 5–8 | Poland | 2176–2179 |
| PT-TM06 / ETRS89 | Portugal | 3763 |

```csv
x;y;elevation;slope;azimuth
5788456,49;7500833,51;100;10;180
```

In the Polish grids `x` is the northing and `y` the easting (the geodetic convention); in the other systems `x` is the easting. An easting implausibly far from the zone's central meridian (300 km for PL-2000, 1000 km otherwise) is rejected with a hint that the zone is wrong or the columns are swapped, instead of plotting the site somewhere else.

The conversion ([`crs.js`](crs.js)) is the transverse Mercator inverse with the Krüger series to sixth order (Karney 2011), written without a projection library. Tests compare it with PROJ (pyproj) at 21 points on both hemispheres: forward and inverse agree to within 0.1 mm, the rounding of the reference values. Systems that need a datum shift (e.g. the British National Grid on OSGB36) are not supported; ETRS89 and WGS84 are treated as equal, which is within about a metre.

## Usage

1. Open the [live demo](https://wyplerszymon0-lab.github.io/Solar-site-intelligence/)
2. Upload a CSV file or click **Load Demo Data**
3. Click **Analyze Site →** to generate the AI report — free, through the demo backend
4. Optionally enter your own Anthropic API key to pick the model and skip the daily limit

Everything except the keyless AI report runs in the browser.

### A note on the API key

With your own key there is no server in between: the key is used only to call `api.anthropic.com` directly from your own browser tab. That also means you're pasting a real API key into a static webpage — only do this with a key you control, on a device you trust. Check "Remember on this device" only if you want it kept in `localStorage` between visits; leave it unchecked to keep the key session-only.

## Yield model

The browser fetches the site's monthly climatology from the [NASA POWER](https://power.larc.nasa.gov/) API (global and diffuse horizontal irradiance and air temperature, 2001–2020 means) and computes the yield in [`solar-model.js`](solar-model.js). The climatology is cached in the browser with its retrieval date, which the source badge shows; after 180 days it is fetched again (if that fails, the cached data stays in use):

1. **Transposition to the panel plane**: isotropic-sky model (Liu & Jordan; Duffie & Beckman, *Solar Engineering of Thermal Processes*, §2.19). The beam factor R_b is integrated over the day of each month's representative date, so any tilt, azimuth and hemisphere use one formula.
2. **Reflection at the glass**: ASHRAE incidence-angle modifier (b₀ = 0.05) on the beam, integrated over the day, and on sky and ground radiation at their effective incidence angles (Duffie & Beckman eq. 5.4.1–2).
3. **Losses**: system losses set in the Configuration panel (default 14%, PVGIS's default input; remembered in this browser), −0.4%/°C above 25 °C cell temperature, with cells assumed 20 °C above the monthly mean air temperature.

If NASA POWER can't be reached, the app falls back to the old latitude-based estimate and labels it as such.

### Validation against PVGIS

[PVGIS 5.3](https://re.jrc.ec.europa.eu/pvg_tools/en/) (European Commission JRC) is the reference tool for PV yield in Europe and Africa. No parameter was fitted to it. The PVGIS API cannot be called from a browser (no CORS), which is why the app uses NASA POWER.

| Site | Tilt / facing | PVGIS kWh/kWp | This model | Without reflection losses | Previous formula |
|---|---|---:|---:|---:|---:|
| Lisbon | 35° S | 1579 | 1528 (−3.2%) | 1580 (+0.1%) | 1589 (+0.7%) |
| Madrid | 36° S | 1620 | 1532 (−5.4%) | 1583 (−2.2%) | 1564 (−3.4%) |
| Warsaw | 47° S | 1045 | 974 (−6.8%) | 1008 (−3.6%) | 1387 (+32.7%) |
| Oslo | 54° S | 948 | 943 (−0.5%) | 975 (+2.8%) | 1271 (+34.0%) |
| Cairo | 27° S | 1819 | 1709 (−6.1%) | 1768 (−2.8%) | 1481 (−18.6%) |
| Sydney | 30° N | 1557 | 1463 (−6.0%) | 1514 (−2.7%) | 1538 (−1.2%) |
| Johannesburg | 24° N | 1728 | 1752 (+1.4%) | 1812 (+4.8%) | 1423 (−17.7%) |
| Lisbon | 35° W | 1293 | 1317 (+1.9%) | 1365 (+5.6%) | — |
| Lisbon | 35° E | 1252 | 1317 (+5.2%) | 1365 (+9.0%) | — |
| Lisbon | 15° N | 1154 | 1184 (+2.6%) | 1256 (+8.9%) | — |
| Lisbon | flat | 1372 | 1363 (−0.6%) | 1432 (+4.4%) | — |
| **Mean absolute error** | | | **3.6%** | 4.3% | 15.5% (7 sites) |

The previous formula only knew latitude and happened to be calibrated around Lisbon; it missed cloudy northern climates and sunny low latitudes by 18–34%.

Adding glass reflection losses was a trade-off, kept because it is physically correct and PVGIS models it too: it cut the error for east, west, north-facing and flat arrays from 4.4–9.0% to 0.6–5.2%, but moved well-oriented arrays from a mixed ±3% to a consistently low −0.5…−6.8% (mean 4.2%). The remaining low bias for optimal orientations likely comes from differences between NASA POWER's and PVGIS's irradiance data; it was not tuned away.

**Known limits.** No near-object shading (buildings, trees); terrain shading is optional (below). The optimal tilt comes out 1–3° below PVGIS's (Warsaw 36° vs 39°), though yield is flat near the optimum. NASA POWER's resolution is ~0.5–1°, so coastal and mountain sites mix neighbouring climates.

### Horizon shading from terrain

Mountains and hills block the low sun. **Compute horizon from terrain** samples the ground around the site centre in 48 directions (every 7.5°, PVGIS's step) at 12 distances from 100 m to 25 km, spaced geometrically, and takes the steepest elevation angle in each direction after Earth curvature and refraction (*d*²(1 − 0.13) / 2*R*: a peak 25 km away sits ~43 m lower than on a flat Earth). Heights come from the **Open-Meteo elevation API** (Copernicus DEM GLO-90, global, callable from the browser) ([`horizon.js`](horizon.js)). The free service allows about 600 heights a minute and a few thousand an hour per visitor, so the 577 heights for one site are fetched only on request and kept in this browser.

In the yield model, hours when the sun is below the skyline add no beam irradiance to the plane. Every yield in the app then includes the horizon: the measured orientation, the optimal tilt, P50/P90 and the economics. The chart shows the skyline with the sun's path on 21 June and 21 December.

**Validation against PVGIS**, in two separate parts so the terrain data and the physics can each be judged:

| Site | Skyline vs PVGIS `printhorizon` (RMSE) | Mean skyline, ours / PVGIS |
|------|------|------|
| Zermatt (Alps) | 2.0° | 19.6° / 20.2° |
| Innsbruck (Inn valley) | 2.0° | 8.0° / 9.6° |
| Lisbon (demo) | 1.3° | 2.2° / 2.3° |
| Warsaw (flat) | 1.1° | 1.4° / 1.1° |

The skyline comes out slightly low in valleys: with 12 distances, some ridge crests fall between samples. A denser 1–10 km scheme with 36 directions (same 577 heights), tried only at Zermatt, gave 1.8° instead of 2.0°: too little to give up PVGIS's 7.5° step.

The fixtures behind the tests are recorded with `node tools/make-horizon-fixtures.mjs terrain|physics`.

Yield loss with **PVGIS's own horizon** as input (35° south, 14% losses), compared with PVGIS run with and without its horizon:

| Site | Mean skyline | PVGIS | This model, beam shaded | Beam and sky diffuse shaded |
|------|------|------|------|------|
| Zermatt | 20.2° | −14.0% | −10.3% | −15.1% |
| Innsbruck | 9.5° | −1.5% | −2.2% | −3.5% |
| Chamonix | 18.9° | −8.9% | −11.6% | −15.7% |
| Hallstatt | 22.5° | −15.8% | −14.6% | −21.4% |
| Bergen | 7.7° | −4.3% | −4.5% | −5.5% |
| Lisbon, Warsaw | 2.2°, 1.1° | 0.0%, 0.0% | −0.4%, −0.2% | −0.4%, −0.3% |

Shading only the beam is within 1.7 percentage points of PVGIS on average at the five mountain sites; also removing the isotropic diffuse sky behind the skyline doubled the gap (3.3 points), so only the beam is shaded. That choice was made on this comparison, so these five sites are not an independent test of it. The diffuse light from the hidden sky is still counted, which is physically optimistic in deep valleys.

### Year-to-year variability (P50 / P90)

The average year is not the whole story: lenders size a solar farm's debt on **P90**, the annual yield exceeded in 9 years out of 10. The app fetches NASA POWER's month-by-month values for every year since 2001 (the CERES-based record the climatology also comes from; earlier years use another satellite product and would mix two records), runs the same yield model on each year at the surveyed orientation, and reports:

- **P50** = the mean, **P90** = mean − 1.2816 σ (normal approximation, the usual convention), with the empirical 10th percentile in the tooltip and the AI prompt as a check;
- a chart of each year's yield with the P50 and P90 lines, years below P90 in red.

| Site | Years | P50 | P90 | Year-to-year σ | Empirical 10th pct. |
|------|-------|-----|-----|----------------|---------------------|
| Warsaw, 35° S | 2001–2025 | 990 | 936 (−5.4%) | 4.2% | 932 |
| Lisbon demo, surveyed 11.9° / 175° | 2001–2025 | 1464 | 1417 (−3.2%) | 2.5% | — |

As a consistency check, the mean of the yearly runs over 2001–2020 (Warsaw: 986.0 kWh/kWp) matches the yield from the 2001–2020 climatology (986.3) to 0.03%: the two requests describe the same data.

**What this P90 is not.** It is weather variability only. A bankable P90 also folds in the uncertainty of the yield model (see the PVGIS comparison above) and of the satellite irradiance, typically a few percent each, which would push it lower. Years NASA has not completed yet are left out.

## Economics (per kWp, your prices)

Prices differ by country and change every year, so the app does not guess them: enter the investment per kWp, what a kWh is worth to you (a tariff, a PPA price or the retail price you avoid) and a real discount rate, in any currency. Everything is per kWp, so no plant size is assumed ([`economics.js`](economics.js)).

With yield *Y* (kWh/kWp in year 1), degradation *d*, O&M cost *M* per year, price *p*, investment *C*, real discount rate *r* and lifetime *L*:

- energy in year *t*: *E<sub>t</sub>* = *Y* (1 − *d*)<sup>*t*−1</sup>; cash in year *t*: *E<sub>t</sub> p* − *M*
- **LCOE** = (*C* + Σ *M* / (1+*r*)<sup>*t*</sup>) / Σ *E<sub>t</sub>* / (1+*r*)<sup>*t*</sup>: selling at the LCOE gives NPV = 0, which the tests check
- **NPV** at *r*, **IRR** (the rate where NPV = 0, by bisection; negative for a project that never earns its investment back), **payback** (years until the cumulative cash turns positive, interpolated within the year)

Each is shown for the **P50** and the **P90** yield (see above). P90 applies a poor year's yield to every year, so it is a cautious case rather than a forecast.

Defaults only where a typical value is defensible: degradation **0.5 % a year** (the median of field measurements in Jordan & Kurtz, "Photovoltaic Degradation Rates — an Analytical Review", NREL 2013) and a **25-year** lifetime (the usual module performance warranty). O&M defaults to 0. Investment, energy value and discount rate have no default.

Left out: taxes and depreciation, subsidies, loans and their terms, inflation beyond the real rate, inverter replacement, decommissioning, and any change in the value of energy over time.

## A note on the heuristic estimates

Row spacing, shading risk and outlier detection are **rough, client-side approximations** built from the uploaded lat/lon/elevation/slope/azimuth alone — there's no true 3D shading model and no soil or grid-connection analysis behind them. Treat them as a quick first read, not a substitute for a proper site assessment.

## AI backend (Google Cloud Run)

So that every visitor can see the AI report, the page sends the conversation to a small backend in [`server/`](server/) when no key is entered:

```
browser (GitHub Pages) ──POST /report──▶ Cloud Run "solar-ai" (Node, europe-central2) ──▶ Claude Haiku 5.5
                     ◀── same SSE stream ──┘    │ no stored key (workload identity), counter in Firestore
```

- **The server owns the prompt.** The page sends only the language and the conversation; the system prompt and the model are fixed on the server, so the public endpoint is not a free general-purpose chatbot.
- **Hard limits:** 50 reports a day in total (a Firestore counter, so it holds across instances), 10 per visitor, at most 11 messages and 20 000 characters per request, and only this site's origin (others get 403). Cloud Run scales to zero and to at most 2 instances.
- **No stored API key at all (workload identity federation):** the service asks Google's metadata server for an ID token of its own service account (audience `api.anthropic.com`), and Anthropic exchanges it for an access token valid 10 minutes. The federation rule in Claude Console accepts only this service account (its numeric ID and email), so there is nothing to leak or rotate. The SDK refreshes the token before it expires; the server refuses to start if an API key is configured next to the rule, because the SDK would prefer the key silently ([`server/lib/anthropic-auth.js`](server/lib/anthropic-auth.js)). Locally, `ANTHROPIC_API_KEY` still works.
- **Measured cost:** one report is about 450 input and 2 100 output tokens (part of it the model's thinking), **$0.0011**. At the daily cap that is at most about $0.06 a day; prepaid credits without auto-reload are a ceiling on top, and a GCP budget alert watches the project.
- **Same stream format:** the server forwards the Messages API's server-sent events unchanged, so the page reads one format whether it talks to Anthropic directly or to the backend.

`AI_PROVIDER=vertex` switches the backend to Claude on Vertex AI (billed through GCP, no key at all), which waits on a Vertex quota for this project. Tests: `cd server && node --test` (validation, limits, CORS, streaming and errors against a fake model).

## Tech Stack

- **Vanilla HTML/CSS/JS** — zero build step
- **Leaflet.js** + **Leaflet.markercluster** + **Leaflet.heat** — map rendering, clustering, heatmap view
- **NASA POWER API** — satellite irradiance and temperature climatology (no key needed)
- **Claude API** (Opus 5 / Sonnet 5 / Haiku 4.5 with your key; Haiku 5.5 through the backend) — AI site analysis and follow-up chat
- **Google Cloud Run + Firestore + Anthropic workload identity federation** — the keyless AI backend in `server/` (Node, `@anthropic-ai/sdk`)
- **`node --test`** — tests for the yield model (including the PVGIS validation above), the CSV parser, the site geometry and the GeoJSON/print exports; run `node --test` from the repo root
- **GitHub Pages** — hosting

## Background

During my Erasmus+ internship in Portugal, I performed geodetic surveys for solar farm planning — collecting slope, azimuth, and coordinate data across multiple sites. This tool automates the analysis step that previously required manual spreadsheet work and domain expertise.

## License

MIT
