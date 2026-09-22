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
- **Hemisphere-aware optimal tilt & facing** — latitude-based panel angle and south/north facing recommendation, correct on both sides of the equator
- **Estimated annual + seasonal yield** — kWh/kWp/year estimate, broken down by month using a solar-declination model (rough estimate, not TMY-grade)
- **Row-spacing / panel-count estimate** — suggested row spacing and how many rows fit the site, sized to avoid self-shading near the winter solstice
- **Benchmark comparison** — estimated yield vs. a rough global reference (~1500 kWh/kWp/yr)
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

## A note on the heuristic estimates

Row spacing, shading risk, outlier detection, seasonal yield, and the benchmark comparison are all **rough, client-side approximations** built from the uploaded lat/lon/elevation/slope/azimuth alone — there's no real irradiance data (e.g. PVGIS/TMY), no true 3D shading model, and no soil or grid-connection analysis behind them. Treat them as a quick first read, not a substitute for a proper site assessment.

## Tech Stack

- **Vanilla HTML/CSS/JS** — zero build step
- **Leaflet.js** + **Leaflet.markercluster** + **Leaflet.heat** — map rendering, clustering, heatmap view
- **Claude API** (Opus 5 / Sonnet 5 / Haiku 4.5, selectable) — AI site analysis and follow-up chat
- **GitHub Pages** — hosting

## Background

During my Erasmus+ internship in Portugal, I performed geodetic surveys for solar farm planning — collecting slope, azimuth, and coordinate data across multiple sites. This tool automates the analysis step that previously required manual spreadsheet work and domain expertise.

## License

MIT
