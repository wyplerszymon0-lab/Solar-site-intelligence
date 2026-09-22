# Solar Site Intelligence Dashboard

> AI-powered geodetic data analysis tool for photovoltaic site assessment

**[Live Demo →](https://wyplerszymon0-lab.github.io/Solar-site-intelligence/)**

---

## Overview

This project was born from hands-on experience conducting geodetic surveys for photovoltaic installations during an Erasmus+ internship in Portugal. The goal was to automate the analysis process that surveyors typically do manually — turning raw measurement data into actionable installation recommendations.

Upload your geodetic CSV, visualize measurement points on an interactive map, and get an AI-generated site assessment in seconds.

## Features

- **Interactive map visualization** — measurement points rendered on a dark-themed Leaflet map with color-coded solar potential ratings (good / mid / poor)
- **Site boundary overlay** — convex hull drawn around the survey points, used for an accurate area estimate (instead of an inflated bounding-box guess)
- **Automatic site statistics** — average slope, azimuth, elevation, and site area
- **Hemisphere-aware optimal tilt & facing** — latitude-based panel angle and south/north facing recommendation, correct on both sides of the equator
- **Estimated annual yield** — kWh/kWp/year estimate adjusted for terrain and location
- **AI site report** — Claude AI analyzes your data and returns a structured report covering panel configuration, risk factors, and optimization recommendations
- **Optional local key storage** — the API key can be remembered in this browser only (`localStorage`, opt-in, off by default)

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

## Tech Stack

- **Vanilla HTML/CSS/JS** — zero build step, zero dependencies
- **Leaflet.js** — interactive map rendering, CartoDB dark basemap tiles
- **Claude API** (Claude Sonnet 5) — AI site analysis
- **GitHub Pages** — hosting

## Background

During my Erasmus+ internship in Portugal, I performed geodetic surveys for solar farm planning — collecting slope, azimuth, and coordinate data across multiple sites. This tool automates the analysis step that previously required manual spreadsheet work and domain expertise.

## License

MIT
