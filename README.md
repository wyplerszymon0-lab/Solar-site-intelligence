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
- **AI site report** — Claude analyzes your data and returns a structured report (panel configuration, risk factors, recommendations)
- **Follow-up chat** — ask follow-up questions about the report in the same conversation
- **Model picker** — choose Opus 5, Sonnet 5, or Haiku 4.5 depending on quality/speed/cost needs

**Data in & out**
- **Saved analyses** — name and save analyses locally (`localStorage`) and reload them later from this browser
- **Auto-restored last session** — reopening the page restores your most recent analysis
- **Exports** — CSV (with ratings/flags), GeoJSON (points + site boundary polygon), a printable PDF report, and a shareable link that encodes the dataset in the URL (no server involved)
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

> Ratings and yield estimates are hemisphere-aware: sites north of the equator are scored against a south-facing (180°) optimum, sites south of the equator against a north-facing (0°) optimum.

## Usage

1. Open the [live demo](https://wyplerszymon0-lab.github.io/Solar-site-intelligence/)
2. Enter your Anthropic API key (get one at [console.anthropic.com](https://console.anthropic.com))
3. Upload a CSV file or click **Load Demo Data**
4. Click **Analyze Site →** to generate the AI report

No backend required — runs entirely in the browser.

### A note on the API key

There is no server: your key is used only to call `api.anthropic.com` directly from your own browser tab. That also means you're pasting a real API key into a static webpage — only do this with a key you control, on a device you trust. Check "Remember on this device" only if you want it kept in `localStorage` between visits; leave it unchecked to keep the key session-only.

## Yield model

The browser fetches the site's monthly climatology from the [NASA POWER](https://power.larc.nasa.gov/) API (global and diffuse horizontal irradiance and air temperature, 2001–2020 means) and computes the yield in [`solar-model.js`](solar-model.js):

1. **Transposition to the panel plane**: isotropic-sky model (Liu & Jordan; Duffie & Beckman, *Solar Engineering of Thermal Processes*, §2.19). The beam factor R_b is integrated over the day of each month's representative date, so any tilt, azimuth and hemisphere use one formula.
2. **Losses**: 14% system losses (PVGIS's default input), −0.4%/°C above 25 °C cell temperature, with cells assumed 20 °C above the monthly mean air temperature.

If NASA POWER can't be reached, the app falls back to the old latitude-based estimate and labels it as such.

### Validation against PVGIS

[PVGIS 5.3](https://re.jrc.ec.europa.eu/pvg_tools/en/) (European Commission JRC) is the reference tool for PV yield in Europe and Africa. No parameter was fitted to it. The PVGIS API cannot be called from a browser (no CORS), which is why the app uses NASA POWER.

| Site | Tilt / facing | PVGIS kWh/kWp | This model | Previous formula |
|---|---|---:|---:|---:|
| Lisbon | 35° S | 1579 | 1580 (+0.1%) | 1589 (+0.7%) |
| Madrid | 36° S | 1620 | 1583 (−2.2%) | 1564 (−3.4%) |
| Warsaw | 47° S | 1045 | 1008 (−3.6%) | 1387 (+32.7%) |
| Oslo | 54° S | 948 | 975 (+2.8%) | 1271 (+34.0%) |
| Cairo | 27° S | 1819 | 1768 (−2.8%) | 1481 (−18.6%) |
| Sydney | 30° N | 1557 | 1514 (−2.7%) | 1538 (−1.2%) |
| Johannesburg | 24° N | 1728 | 1812 (+4.8%) | 1423 (−17.7%) |
| **Mean absolute error** | | | **2.7%** | **15.5%** |

The previous formula only knew latitude and happened to be calibrated around Lisbon; it missed cloudy northern climates and sunny low latitudes by 18–34%.

**Known limits.** The model has no angle-of-incidence reflection losses and no horizon shading, so for orientations far from optimal it runs high: +4.4% flat, +5.6% west, +9.0% east and +8.9% north-facing at 15° in Lisbon. Its optimal tilt comes out 2–4° lower than PVGIS's (e.g. Warsaw 35° vs 39°), though yield is flat near the optimum. NASA POWER's resolution is ~0.5–1°, so coastal and mountain sites mix neighbouring climates.

## A note on the heuristic estimates

Row spacing, shading risk and outlier detection are **rough, client-side approximations** built from the uploaded lat/lon/elevation/slope/azimuth alone — there's no true 3D shading model and no soil or grid-connection analysis behind them. Treat them as a quick first read, not a substitute for a proper site assessment.

## Tech Stack

- **Vanilla HTML/CSS/JS** — zero build step
- **Leaflet.js** + **Leaflet.markercluster** + **Leaflet.heat** — map rendering, clustering, heatmap view
- **NASA POWER API** — satellite irradiance and temperature climatology (no key needed)
- **Claude API** (Opus 5 / Sonnet 5 / Haiku 4.5, selectable) — AI site analysis and follow-up chat
- **`node --test`** — tests for the yield model, including the PVGIS validation above (`node --test` from the repo root)
- **GitHub Pages** — hosting

## Background

During my Erasmus+ internship in Portugal, I performed geodetic surveys for solar farm planning — collecting slope, azimuth, and coordinate data across multiple sites. This tool automates the analysis step that previously required manual spreadsheet work and domain expertise.

## License

MIT
