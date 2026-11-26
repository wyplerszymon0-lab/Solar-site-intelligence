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
- **Energy yield from satellite irradiance** — annual and monthly kWh/kWp computed from NASA POWER satellite data for every complete year since 2001 (now 2001–2025) at the exact site, at the surveyed tilt and azimuth (see [Yield model](#yield-model))
- **Climate-specific optimal tilt** — the equator-facing tilt that maximises annual yield for this site's climate, found numerically instead of a latitude rule of thumb
- **Orientation check** — how much yield the surveyed orientation loses versus the optimum at the same site
- **Row-spacing / panel-count estimate** — suggested row spacing and how many rows fit the site, sized to avoid self-shading near the winter solstice
- **Capacity of the whole site** — MWp (DC), MWh a year at P50 and P90, land per MWp and the whole site's investment, revenue and NPV, from the area, the row layout's ground coverage ratio and your module efficiency (see [Site capacity](#site-capacity-issue-45))
- **Single-axis tracker alternative** — the yield of tracker rows on a horizontal north–south axis with backtracking at your ground coverage ratio, the gain over the best fixed array, and the tracker layout's MWp and MWh, from the same data; the ideal tracker is validated against PVGIS and the rotation against pvlib (see [Single-axis tracker](#single-axis-tracker-issue-49))
- **Bifacial modules** — what the rear side of fixed rows adds, from a 2-D view-factor model of the rows (infinite sheds) that matches pvlib's rear irradiance within 0.03% (see [Bifacial modules](#bifacial-modules-issue-67))
- **Terrain as a whole** — the site's slope, the direction it falls towards, its north–south and east–west grade and how uneven the ground is, from a least-squares plane through the surveyed heights, checked against pyproj and numpy (see [Terrain from the survey](#terrain-from-the-survey-issue-63))
- **Shading-risk & outlier flags** — heuristic per-point flags for a taller nearby neighbor on the sun side, or a statistically anomalous elevation reading
- **Site charts** — rating distribution, elevation profile, per-point slope, azimuth compass rose, and monthly yield, all inline SVG

**AI analysis**
- **AI site report** — Claude analyzes your data and returns a structured report (panel configuration, risk factors, recommendations). **No API key needed:** without one, the report comes from a small backend on Google Cloud Run (Claude Haiku 5.5, limited per day); see [AI backend](#ai-backend-google-cloud-run)
- **Follow-up chat** — ask follow-up questions about the report in the same conversation
- **Model picker** — with your own key, choose Claude Opus 5.5, Sonnet 5.5 or Haiku 5.5 depending on quality/speed/cost needs ($4 / $2 / $0.10 per million input tokens, $20 / $10 / $0.50 per million output tokens)

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

The browser fetches the site's global and diffuse horizontal irradiance and air temperature from the [NASA POWER](https://power.larc.nasa.gov/) API, month by month for every complete year since 2001. It averages each month over those years (`climatologyFromSeries` in [`solar-model.js`](solar-model.js)) and computes the yield from that mean year. The P50/P90 below run the same model on each year, so the yield and the P50 cover the same years, and the source badge names them: "NASA POWER satellite data 2001–2025". While the series is loading, or if it fails, the app uses NASA's precomputed climatology instead, labelled 2001–2020 (see below why). Both are cached in the browser with their retrieval date, which the badge shows; after 180 days they are fetched again (if that fails, the cached data stays in use):

1. **Transposition to the panel plane**: Hay–Davies anisotropic sky (Hay & Davies 1980; Duffie & Beckman, *Solar Engineering of Thermal Processes*, §2.16): the circumsolar share of the diffuse light, beam / extraterrestrial irradiation each month, is treated like beam light and the rest as an isotropic sky (Liu & Jordan, §2.19). Why it replaced the isotropic sky is explained [below](#where-the-gap-to-pvgis-came-from-issue-35). The beam factor R_b is integrated over the day of each month's representative date, so any tilt, azimuth and hemisphere use one formula. Over that day the beam is spread by the Collares-Pereira & Rabl distribution, which puts less of it near sunrise and sunset than near noon ([issue #41](#why-east-and-west-arrays-were-the-largest-errors-issue-41)).
2. **Reflection at the glass**: ASHRAE incidence-angle modifier (b₀ = 0.05) on the beam, integrated over the day, and on sky and ground radiation at their effective incidence angles (Duffie & Beckman eq. 5.4.1–2).
3. **Losses**: system losses set in the Configuration panel (default 14%, PVGIS's default input; remembered in this browser), −0.4%/°C above 25 °C cell temperature, with cells assumed 20 °C above the monthly mean air temperature.

If NASA POWER can't be reached, the app falls back to the old latitude-based estimate and labels it as such.

**Which years the climatology covers (issue #37).** Since late 2026 the API's header says the climatology covers January 2001 – December 2025. The numbers did not change, though: at Warsaw, Lisbon, Madrid and Johannesburg they equal the mean of NASA's own month-by-month data for **2001–2020**, to within 0.0002 kWh/m²/day. The 2001–2025 mean would differ by 0.04–0.11 kWh/m²/day in some months, and its temperatures by up to 0.6 °C. So the app labels that climatology 2001–2020. `node tools/check-power-period.mjs [lat lon …]` repeats the comparison against the live API, and a test does the same on recorded responses. Since issue #39 the app no longer depends on that label: the climatology it uses is computed from the yearly data, so its period is known exactly. Averaged over 2001–2020, that series reproduces NASA's climatology at all seven validation sites, to within 0.02 kWh/kWp of yield.

### Validation against PVGIS

[PVGIS 5.3](https://re.jrc.ec.europa.eu/pvg_tools/en/) (European Commission JRC) is the reference tool for PV yield in Europe and Africa. No parameter was fitted to it. The PVGIS API cannot be called from a browser (no CORS), which is why the app uses NASA POWER.

| Site | Tilt / facing | PVGIS kWh/kWp | The app: Hay–Davies, beam over the day | Constant clearness (before #41) | Isotropic sky | Isotropic, no reflection losses | Previous formula |
|---|---|---:|---:|---:|---:|---:|---:|
| Lisbon | 35° S | 1579 | 1593 (+0.9%) | 1583 (+0.3%) | 1528 (−3.2%) | 1580 (+0.1%) | 1589 (+0.7%) |
| Madrid | 36° S | 1620 | 1598 (−1.3%) | 1587 (−2.0%) | 1532 (−5.4%) | 1583 (−2.2%) | 1564 (−3.4%) |
| Warsaw | 47° S | 1045 | 1037 (−0.7%) | 1025 (−1.9%) | 974 (−6.8%) | 1008 (−3.6%) | 1387 (+32.7%) |
| Oslo | 54° S | 948 | 1028 (+8.4%) | 1012 (+6.7%) | 943 (−0.5%) | 975 (+2.8%) | 1271 (+34.0%) |
| Cairo | 27° S | 1819 | 1764 (−3.0%) | 1754 (−3.5%) | 1709 (−6.1%) | 1768 (−2.8%) | 1481 (−18.6%) |
| Sydney | 30° N | 1557 | 1510 (−3.0%) | 1502 (−3.5%) | 1463 (−6.0%) | 1514 (−2.7%) | 1538 (−1.2%) |
| Johannesburg | 24° N | 1728 | 1781 (+3.0%) | 1773 (+2.6%) | 1752 (+1.4%) | 1812 (+4.8%) | 1423 (−17.7%) |
| Lisbon | 35° W | 1293 | 1275 (−1.4%) | 1326 (+2.6%) | 1317 (+1.9%) | 1365 (+5.6%) | — |
| Lisbon | 35° E | 1252 | 1275 (+1.9%) | 1326 (+5.9%) | 1317 (+5.2%) | 1365 (+9.0%) | — |
| Lisbon | 15° N | 1154 | 1148 (−0.5%) | 1148 (−0.5%) | 1184 (+2.6%) | 1256 (+8.9%) | — |
| Lisbon | flat | 1372 | 1372 (+0.1%) | 1363 (−0.6%) | 1363 (−0.6%) | 1432 (+4.4%) | — |
| **Mean absolute error** | | | **2.2%** | 2.8% | 3.6% | 4.3% | 15.5% (7 sites) |
| **Mean error, the 7 equator-facing arrays** | | | **+0.6%** | −0.2% | −3.8% | | |

<sub>PVGIS 5.3 PVcalc, 14% losses. The first two model columns average NASA's monthly data over 2001–2025 (issue #39); the isotropic columns use NASA's climatology, 2001–2020 at every site, with constant clearness. Moving from that climatology to the 2001–2025 series shifted the yields by −0.6 … +0.6% and left the mean absolute error at 2.75%. Madrid's and Johannesburg's fixtures were recorded later, under the API's 2001–2025 label, but hold the same 2001–2020 means (issue #37, see [Yield model](#yield-model)).</sub>

The previous formula only knew latitude and happened to be calibrated around Lisbon; it missed cloudy northern climates and sunny low latitudes by 18–34%.

Adding glass reflection losses was a trade-off, kept because it is physically correct and PVGIS models it too. It cut the error for east, west, north-facing and flat arrays from 4.4–9.0% to 0.6–5.2%. With the isotropic sky it also moved well-oriented arrays from a mixed ±3% to a consistently low −0.5…−6.8%.

#### Where the gap to PVGIS came from (issue #35)

The low bias used to be put down to NASA POWER's irradiance data. Splitting the gap in two showed that this was only part of it.

**1. The data.** Horizontal irradiation (GHI), NASA POWER climatology against PVGIS 5.3 MRcalc (2005–2023):

| Site | Isotropic yield vs PVGIS | GHI, NASA vs PVGIS | Left for the model |
|---|---:|---:|---:|
| Lisbon | −3.2% | −0.3% | −2.9 points |
| Warsaw | −6.8% | −2.4% | −4.4 points |
| Oslo | −0.5% | +2.5% | −3.0 points |
| Cairo | −6.1% | −4.3% | −1.8 points |
| Sydney | −6.0% | −1.0% | −5.0 points |

**2. The step to the panel plane.** The ratio of plane-of-array to horizontal irradiation on the same plane (reflection off in the model) is 3.5–5.3% lower than PVGIS's at all five sites (Lisbon 1.101 vs 1.142, Warsaw 1.107 vs 1.169, Oslo 1.180 vs 1.241, Cairo 1.061 vs 1.101, Sydney 1.098 vs 1.149). That is the remainder.

The isotropic sky spreads diffuse light evenly, but on clear days much of it comes from around the sun, which an equator-facing panel faces. **Hay–Davies** (Hay & Davies 1980; Duffie & Beckman §2.16) treats a share A of the diffuse light like beam light. A is the anisotropy index: beam irradiation divided by extraterrestrial irradiation, each month. The rest stays isotropic. It is now the default and removes the low bias: the mean error of the equator-facing arrays goes from −3.8% to −0.2%.

What it does not fix:

- **The data part stays.** With the transposition corrected, the error mostly follows the GHI difference. Oslo, where NASA has 2.5% more than PVGIS, overshoots by 6.1%, and Cairo, with 4.3% less, is 3.6% low. Sydney is the exception: 1.0% less GHI but 3.3% low.
- **East and west get slightly worse**, from +1.9% and +5.2% to +2.6% and +6.0% (fixed in issue #41, [below](#why-east-and-west-arrays-were-the-largest-errors-issue-41)).
- **The terrain-shading comparison gets slightly worse** (below).

The isotropic model stays available as `skyModel: 'isotropic'` in `solar-model.js`.

#### Why east and west arrays were the largest errors (issue #41)

Until issue #41 the model gave Lisbon's east and west arrays the same 1326 kWh/kWp, against PVGIS's 1252 and 1293. That is 4.2% above PVGIS's mean of the two, plus a ±1.6% split the model could not see. Both have a cause, and only the first one is fixed.

**1. Too much beam at low sun (fixed).** The beam factor weighted each moment of the day by extraterrestrial irradiance, as if the sky were as clear at sunrise as at noon. NASA POWER's hourly data for Lisbon (2023) show otherwise: the clearness index (GHI / extraterrestrial) is 0.66 within an hour of solar noon and 0.45 at 5–6 hours from it. It falls even under clear skies (0.74 → 0.53), because the light crosses more air. East and west arrays get most of their beam in those low-sun hours, so they were overrated. The model now spreads each month's beam over the day with the **Collares-Pereira & Rabl** (1979) distribution of global irradiation minus the **Liu & Jordan** (1960) one of diffuse (Duffie & Beckman eqs. 2.13.1–2.13.2). Both are textbook fits, and nothing was fitted to PVGIS.

| Lisbon, 35° | PVGIS | Constant clearness | Collares-Pereira & Rabl |
|---|---:|---:|---:|
| East | 1252 | 1326 (+5.9%) | 1275 (+1.9%) |
| West | 1293 | 1326 (+2.6%) | 1275 (−1.4%) |
| Mean absolute error, 11 cases | | 2.75% | **2.20%** |

It works for both sky models (isotropic 3.6% → 3.0%), and it leaves the optimal tilt at Warsaw where it was (39°). What gets worse:

- **Every equator-facing array rises by 0.4–1.6%**, so their mean error goes from −0.2% to +0.6%, and **Oslo goes from +6.7% to +8.4%**. Oslo was already the largest error, because NASA's GHI there is 2.5% above PVGIS's. The tests give Oslo a limit of 9% and every other case 7%.
- **Terrain shading moves at some sites** (see below). The mean gap to PVGIS improves slightly (2.0 → 1.9 points), but Zermatt goes from 1.9 to 5.0 points.

The old weighting stays available as `beamProfile: 'constant-clearness'` in `solar-model.js`.

**2. Clearer afternoons (not modelled).** PVGIS's west array beats its east array by 3.3%, and the reason is the weather, not a time-stamp artefact. At first a fixed 48-minute offset between PVGIS's all-sky and clear-sky days looked like one. But PVGIS's SARAH values are instantaneous at about HH:10 ([PVGIS manual](https://joint-research-centre.ec.europa.eu/photovoltaic-geographical-information-system-pvgis/getting-started-pvgis/pvgis-user-manual_en)), and PVGIS computes the sun for that same minute (RMS 0.09° in `seriescalc`, 2020). More than 2 h from noon, the afternoon is clearer than the morning in both data sets: by 2.8% in NASA's hourly data for 2023 and by 5.8% in PVGIS's 2005–2023 mean day. In PVGIS 2020, the west array gets 4.8% more beam than the east array, though the afternoons are 1.2 °C warmer. Monthly means cannot show this. Modelling it would need hourly data, about 0.5 MB per site and year, for a ±1.6% effect.

**Known limits.** No near-object shading (buildings, trees); terrain shading is optional (below). The optimal tilt now matches PVGIS's at Warsaw (39°; the isotropic sky gave 36°). NASA POWER's resolution is ~0.5–1°, so coastal and mountain sites mix neighbouring climates.

### Horizon shading from terrain

Mountains and hills block the low sun. **Compute horizon from terrain** samples the ground around the site centre in 48 directions (every 7.5°, PVGIS's step) at 12 distances from 100 m to 25 km, spaced geometrically, and takes the steepest elevation angle in each direction after Earth curvature and refraction (*d*²(1 − 0.13) / 2*R*: a peak 25 km away sits ~43 m lower than on a flat Earth). Heights come from the **Open-Meteo elevation API** (Copernicus DEM GLO-90, global, callable from the browser) ([`horizon.js`](horizon.js)). The free service allows about 600 heights a minute and a few thousand an hour per visitor, so the 577 heights for one site are fetched only on request and kept in this browser.

In the yield model, hours when the sun is below the skyline add no beam irradiance to the plane, and with the Hay–Davies sky no circumsolar light either. Every yield in the app then includes the horizon: the measured orientation, the optimal tilt, P50/P90 and the economics. The chart shows the skyline with the sun's path on 21 June and 21 December.

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

| Site | Mean skyline | PVGIS | The app: Hay–Davies, beam over the day | Hay–Davies, constant clearness | Isotropic: beam shaded | Isotropic: beam and sky diffuse shaded |
|------|------|------|------|------|------|------|
| Zermatt | 20.2° | −14.0% | −9.0% | −12.1% | −10.3% | −15.1% |
| Innsbruck | 9.5° | −1.5% | −1.4% | −2.5% | −2.2% | −3.5% |
| Chamonix | 18.9° | −8.9% | −11.3% | −13.5% | −11.6% | −15.7% |
| Hallstatt | 22.5° | −15.8% | −14.3% | −17.2% | −14.6% | −21.4% |
| Bergen | 7.7° | −4.3% | −4.0% | −5.2% | −4.5% | −5.5% |
| Lisbon, Warsaw | 2.2°, 1.1° | 0.0%, 0.0% | — | — | −0.4%, −0.2% | −0.4%, −0.3% |

With the isotropic sky, shading only the beam was within 1.6 percentage points of PVGIS on average at the five mountain sites. Also removing the isotropic diffuse sky behind the skyline doubled the gap (3.3 points), so only the beam was shaded. That choice was made on this comparison, so these five sites are not an independent test of it.

Hay–Davies also hides the circumsolar light whenever the sun is behind the skyline, because that light comes from the sun's direction. That is physically right, but it moves the losses away from PVGIS's: the mean gap is 2.0 points, against 1.6 for the isotropic beam-only case. It is closer at Zermatt and further at the other four, and furthest at Chamonix (4.6 points). PVGIS appears to shade the beam only. The isotropic share of the diffuse light from the hidden sky is still counted, which is physically optimistic in deep valleys.

Spreading the beam over the day (issue #41) puts less of it at low sun, so a skyline that hides the morning and evening sun costs less. The mean gap is now 1.9 points: closer at Innsbruck, Chamonix, Hallstatt and Bergen, further at Zermatt (5.0 points). Zermatt's valley runs north–south, so its mountains hide mostly the low sun, and PVGIS loses more there, probably because the clear alpine air keeps more beam at low sun than a textbook distribution fitted to lowland stations allows.

### Single-axis tracker (issue #49)

Most large solar farms are now built on single-axis trackers: rows on a horizontal north–south axis that turn the modules from east in the morning to west in the evening. A card shows what such a tracker would yield at the site and its gain over the fixed array at the optimal tilt. It assumes rows at the ground coverage ratio from Configuration, with backtracking ([below](#tracker-rows-and-backtracking-issue-53)). The ideal tracker on its own, with no neighbouring rows, gives Warsaw 1231 against 1045 kWh/kWp (+17.8%) and Lisbon 2021 against 1594 (+26.8%).

**The model** ([`solar-model.js`](solar-model.js), `trackerDayFactors`). At each moment of the month's representative day, the modules turn by R = atan(east component / up component of the sun's direction), the angle that brings them closest to the sun. It is the same day, beam spread and Hay–Davies sky as for fixed arrays. Because the module's tilt changes over the day, the sky view factor (1 + cos R)/2 and the ground view factor (1 − cos R)/2 are averaged moment by moment as well, weighted by the day's diffuse and global distributions, and glass reflection is taken at the actual angles. A rotation limit is an option of the model (real trackers stop at ±50–60°; ±60° costs 0.8–1.3% at the seven sites). The app uses none, like PVGIS, whose manual says its tracker "always minimizes the angle between the normal of the module plane and the direction to the sun". It does not mention rotation limits, backtracking or row shading. The app's tracker has none of them either, and it assumes flat ground.

**Validation** against PVGIS 5.3 `PVcalc` with `inclined_axis=1` at 0° slope (a horizontal north–south axis), 14% losses, at the seven sites of the fixed-array validation (fixture recorded by [`tools/make-tracker-fixtures.mjs`](tools/make-tracker-fixtures.mjs)). Nothing was fitted.

| Site | PVGIS tracker, kWh/kWp | The app | Error | Gain over the fixed array, PVGIS / app | Plane-of-array gain, PVGIS / app |
| :--- | ---: | ---: | ---: | ---: | ---: |
| Lisbon | 1960 | 2021 | +3.1% | +24.1% / +26.9% | 1.225 / 1.254 |
| Warsaw | 1222 | 1231 | +0.8% | +16.9% / +18.7% | 1.160 / 1.184 |
| Oslo | 1095 | 1219 | +11.2% | +15.5% / +18.6% | 1.146 / 1.187 |
| Cairo | 2260 | 2292 | +1.4% | +24.3% / +29.9% | 1.233 / 1.283 |
| Sydney | 1891 | 1892 | +0.1% | +21.5% / +25.4% | 1.198 / 1.238 |
| Madrid | 1966 | 2007 | +2.1% | +21.4% / +25.6% | 1.204 / 1.247 |
| Johannesburg | 2116 | 2301 | +8.7% | +22.3% / +29.2% | 1.211 / 1.274 |

<sub>Fixed array: the validation tilt of each site ([table above](#validation-against-pvgis)), equator-facing. Plane-of-array gain: in-plane irradiation of the tracker over that of the fixed array, before temperature and module losses (PVGIS `H(i)_y`; the app without glass reflection, which PVGIS reports separately).</sub>

The RMS error is **5.6%** (3.9% without Oslo), against 3.8% for fixed arrays. The tooltip gives it as the tracker's uncertainty, and a test recomputes it.

**The gain is overrated, by 3.3 points on average.** The overshoot is already in the plane-of-array irradiation, at every site, so it is not temperature or module efficiency. Terrain is not the cause either: PVGIS without its horizon changes by under 0.5%, except Sydney (+3.9%). A tracker gets most of its extra light in the low-sun hours, which is where the model's beam is least certain ([issue #41](#why-east-and-west-arrays-were-the-largest-errors-issue-41)). With constant clearness, the overshoot was 14 points. The Collares-Pereira & Rabl spread brings it down to 3.3, but a textbook distribution of monthly means cannot get it all. Johannesburg (+8.7%), a clear highveld site where most of the beam comes at low sun, shows it most. So the ideal tracker is an upper estimate. Economics and P90 stay for the fixed array, because a tracker has its own costs.

#### Beam at low sun (issue #51)

PVGIS's hourly data locate the overshoot. The table gives the share of the year's direct normal irradiation (DNI, the beam on a surface facing the sun) at each sun elevation. It compares PVGIS 5.3 `seriescalc` for 2020 (horizontal, with components, DNI = Gb / sin h, fixture recorded by [`tools/make-dni-fixture.mjs`](tools/make-dni-fixture.mjs)) with the model's mean days for 2001–2025:

| Sun elevation | 0–5° | 5–10° | 10–15° | 15–20° | 20–30° | 30–45° | 45–90° |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Lisbon, PVGIS / model | 0.9 / **4.4%** | 4.4 / 5.1% | 5.2 / 5.9% | 8.5 / 6.7% | 18.2 / 19.1% | 27.8 / 25.0% | 35.1 / 33.8% |
| Warsaw | 1.0 / **4.6%** | 4.8 / 6.3% | 9.4 / 9.0% | 9.2 / 10.0% | 18.3 / 19.5% | 31.9 / 26.5% | 25.4 / 24.0% |
| Johannesburg | 1.2 / **4.1%** | 3.0 / 4.5% | 5.4 / 5.2% | 5.6 / 5.7% | 14.2 / 13.4% | 32.2 / 30.4% | 38.5 / 36.6% |

Below 5° the model has about 4 times PVGIS's share. Above 20° the two agree to within 6 points, and a test checks both. The cause is in the distributions:
- Collares-Pereira & Rabl's global distribution minus Liu & Jordan's diffuse one leaves the DNI roughly constant down to sunrise.
- The real DNI fades as the light crosses more air.

A fixed array facing the equator gets little of that light at a steep angle. An ideal tracker faces it squarely, and that is about the 3 points.

Two textbook alternatives were tried in a prototype, and nothing was fitted:

| Beam over the day | Tracker vs PVGIS: mean / RMS | Fixed arrays: RMS | All 11 fixed cases: MAE | DNI at 0–5°, Lisbon |
| :--- | ---: | ---: | ---: | ---: |
| Collares-Pereira & Rabl (the app) | +3.9% / 5.6% | 3.79% | 2.20% | 4.4% |
| Hottel's clear-sky beam (Duffie & Beckman §2.8; mid-latitude summer, site altitude) | +0.5% / 4.5% | 4.09% | 2.30% | 2.1% |
| Collares-Pereira & Rabl × Hottel's attenuation | −5.7% / 6.9% | 4.40% | 2.72% | 1.1% |

Neither improves everything:
- **Hottel's clear-sky shape** fixes the tracker on average. But it gives fixed arrays slightly larger errors (Lisbon west −3.4%) and too little DNI at 5–20°.
- **The product of the two** overcorrects.

Trying further variants until one matched PVGIS would amount to fitting to it, so the model stays as it is and the tracker card says it is an upper estimate. A real fix needs the hourly data itself, not a better shape for the mean day. That is the same conclusion as for the clearer afternoons ([issue #41](#why-east-and-west-arrays-were-the-largest-errors-issue-41)). Hourly data were then tried ([below](#hourly-data-instead-of-the-mean-day-issue-57)).

#### Hourly data instead of the mean day? (issue #57)

NASA POWER also serves hourly GHI, diffuse irradiance, DNI and temperature. That is about 650 kB per site and year, and the API answers browsers (CORS `*`). The model has an hourly version, `hourlyYield` in [`solar-model.js`](solar-model.js). It uses the same physics as the mean day: Hay–Davies sky, ASHRAE reflection, the same temperature rule, the horizon, and fixed or tracking mounting with backtracking. Only the data differ: the sun is placed at the middle of each hour, so the beam at low sun and any morning/afternoon asymmetry come from the data and not from a distribution.

**The timestamp convention had to be measured.** NASA's documentation does not say whether an hourly value belongs to the hour starting or ending at its stamp, and ±30 minutes moves east and west arrays by 6–12%. The data answer it themselves: with values placed at HH:00 UTC, the day's GHI centroid falls 26–32 minutes before solar noon at all seven sites (median of 2020). So a value covers the hour starting at its stamp. A test checks this, using NASA's data alone and not PVGIS.

**The low-sun beam is right:** hourly NASA DNI puts 0.9–1.1% of the year's DNI below 5° of sun elevation, against PVGIS's 0.9–1.2%. The mean day puts 4.1–4.6% there.

**Validation:** seven sites, the year 2020 on both sides. PVGIS 5.3 `seriescalc` sums for 2020 (1 kWp, 14% losses, no horizon) are compared with the hourly model on NASA's hourly 2020 data and the mean day on NASA's monthly 2020 data. The fixture, recorded by [`tools/make-hourly-fixture.mjs`](tools/make-hourly-fixture.mjs), holds the NASA hours as compact integers, gzipped to 230 kB, and PVGIS's annual sums only.

| Against PVGIS 2020, 7 sites | Hourly: mean / MAE | Mean day: mean / MAE |
| :--- | ---: | ---: |
| Equator-facing, validation tilt | +0.2% / 3.36% | +1.9% / **3.20%** |
| East 35° | −1.2% / 3.85% | +1.2% / **2.48%** |
| West 35° | −2.4% / 3.61% | +2.1% / **3.15%** |
| Tracker (N–S) | −2.8% / **5.10%** | +4.9% / 5.81% |
| **All 28** | −1.5% / 3.98% | +2.5% / **3.66%** |

<sub>The PVGIS tracker is `trackingtype=5` (inclined axis) at 0° slope, the mounting of the [tracker validation](#single-axis-tracker-issue-49). `trackingtype=1` (horizontal N–S axis) gave Sydney, the one PVGIS-ERA5 site, 1360 kWh/kWp, below its fixed array, against 1849 for type 5.</sub>

Hourly data fix what they were meant to fix: the tracker is no longer overrated, and its mean error goes from +4.9% to −2.8%. But they make fixed arrays slightly worse, with errors mostly negative (Cairo −4 to −5%, Sydney −5%), so across all 28 cases the mean day stays a little closer to PVGIS. RMS favours hourly data (4.79 against 5.13%), because the mean day's largest errors are trackers. The issue's rule was to adopt hourly data only if they beat the mean day across the sites, and they do not, so **the app keeps the mean day**. The study and `hourlyYield` stay in the code with their tests, for the day a second year or a better hourly diffuse split tips the balance. The likely suspect was NASA's own hourly split of GHI into beam and diffuse. It was tested next ([below](#is-it-nasas-hourly-split-issue-59)) and ruled out: the gap on fixed arrays is mostly the temperature rule.

##### Is it NASA's hourly split? (issue #59)

No. NASA's three hourly columns agree with each other: over the year's daylight hours, DNI·cos Z + DHI is within −2.6% to +1.8% of GHI at the seven sites. Splitting NASA's GHI again with the Erbs et al. (1982) decomposition, checked against pvlib's `erbs`, makes things worse. It puts more of the light in the diffuse part at six sites of seven, and the MAE against PVGIS 2020 rises:

| Against PVGIS 2020 | NASA split | Erbs split | Mean day |
| :--- | ---: | ---: | ---: |
| Fixed arrays (21) | 3.61% | 3.74% | **2.94%** |
| All 28 | 3.98% | 4.89% | **3.66%** |

The rule set in the issue, Erbs bringing fixed arrays below the mean day, fails, so the split is ruled out.

**What the gap is instead: temperature.** NASA's hourly GHI and DHI sum to the monthly values to within 0.1%, so both models see the same light. The difference is in the temperature rule, cell = air + 20 °C. It was set for the mean day, whose temperature is the 24-hour mean. Hourly data apply it to the actual hour, and the hours that make energy are the warm ones: weighted by irradiance, they are 1.5 °C (Lisbon) to 5.7 °C (Johannesburg) above the monthly mean. On equator-facing arrays, hourly data give 1.7% less than the mean day with the temperature term and 0.2% less without it. East, west and trackers keep a gap without it (−1.4%, −2.6% and −6.2%). That part is the mean day's morning/afternoon symmetry and low-sun beam ([#41](#why-east-and-west-arrays-were-the-largest-errors-issue-41), [#51](#beam-at-low-sun-issue-51)), where the hourly data are the more physical of the two.

So a fair hourly model needs a cell temperature that depends on the hour's irradiance (and wind), as PVGIS uses, and not a fixed +20 °C. That was not tried here, so the rule could not be fitted after seeing the results. It was tried next, with its own rule ([below](#a-module-temperature-as-pvgis-issue-61)). Tests: [`test/hourly-split.test.js`](test/hourly-split.test.js).

##### A module temperature as PVGIS? (issue #61)

PVGIS's [methods page](https://joint-research-centre.ec.europa.eu/photovoltaic-geographical-information-system-pvgis/getting-started-pvgis/pvgis-data-sources-calculation-methods_en) gives its module model:
- **Module temperature:** Faiman (2008), T + G / (U0 + U1·wind), with U0 = 26.9 W/(°C·m²) and U1 = 6.2 W·s/(°C·m³) for free-standing c-Si.
- **Power:** the Huld et al. (2011) efficiency, which also covers the loss at low irradiance.

`hourlyYield` has both as options (`moduleTemp: 'faiman'`, `power: 'huld'`, with PVGIS 5's c-Si coefficients), checked against pvlib 0.16.1. The wind is NASA POWER's hourly WS10M for 2020, recorded by [`tools/make-wind-fixture.mjs`](tools/make-wind-fixture.mjs). The page does not say which wind height PVGIS uses, so 10 m is an assumption. Only published coefficients are used, and nothing is fitted to PVGIS.

| MAE against PVGIS 2020 | Fixed (21) | All 28 | Trackers (7) |
| :--- | ---: | ---: | ---: |
| Hourly, T + 20 °C | 3.61% | 3.98% | 5.10% |
| Hourly, A: Faiman | 3.33% | **3.37%** | **3.52%** |
| Hourly, B: Faiman + Huld | 3.40% | 3.64% | 4.35% |
| Mean day | **2.94%** | 3.66% | 5.81% |

Both variants bring hourly data closer to PVGIS than the fixed +20 °C. Faiman modules run cooler, so A raises yields (mean +1.6% over all 28, against −1.5%), and Huld's low-light loss takes most of that back (B −1.6%). Both beat the mean day over all 28 cases, mostly through the trackers. On fixed arrays neither does. The issue's rule asked for both, so **the app keeps the mean day**. Tests: [`test/hourly-temperature.test.js`](test/hourly-temperature.test.js).

#### Tracker rows and backtracking (issue #53)

An ideal tracker has no neighbours. Real rows stand at a pitch of module width / GCR, and when they turn towards a low sun they shade the next row. **Backtracking** prevents this. Once |cos R| < GCR, the rows turn back towards flat, to R − sign(R)·acos(|cos R| / GCR), the angle at which one row's shadow just ends at the next (Anderson & Mikofski 2020, flat ground). This removes beam shading between rows, at the cost of a larger incidence angle.

**The rotation is checked against pvlib.** `pvlib.tracking.singleaxis` 0.16.1 (horizontal axis pointing south, flat ground; fixture by [`test/fixtures/make-tracker-pvlib.py`](test/fixtures/make-tracker-pvlib.py)) was run at 1700 sun positions: four latitudes, five days, every 10° of hour angle and five GCR / limit / backtracking combinations. Rotation and incidence angle agree with the app's to 5·10⁻⁵°, the rounding of the fixture. A test also checks the geometry itself: after backtracking, a row's shadow is exactly one pitch long.

**Settings** (remembered in this browser):
- **Tracker GCR, default 0.33.** That is the middle of the 0.25–0.40 that [Bolinger & Bolinger (2022)](https://www.energy.gov/sites/default/files/2022-01/lbnl_ieee-land-requirements-for-utility-scale-pv.pdf) give as typical for US tracking plants. They give 0.40–0.50 for fixed-tilt plants.
- **Rotation limit, default none.** PVGIS and pvlib's default have none, and I found no source for a "typical" value. Enter the mechanical stop from the tracker's datasheet. ±60° costs the ideal tracker 0.8–1.3% at the seven validation sites.

**Capacity** follows the fixed-array formula ([Site capacity](#site-capacity-issue-45)) with the tracker GCR. At 0.33 and 21% modules that is 0.69 MWp per hectare, or 1.44 ha per MWp. Bolinger & Bolinger's median for US tracking plants built in 2019 is 0.59 MWdc/ha. That figure is for the modules of that year and for whole fenced areas, so it is a plausibility check, not a validation.

**What backtracking costs, and why it is overstated:**

| GCR | Warsaw | Lisbon | Oslo | Cairo | Johannesburg |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 0.10 | | −2.2% | | | |
| 0.25 | −5.4% | −5.9% | −7.7% | −5.3% | −5.6% |
| 0.33 | −7.6% | −8.1% | −10.6% | −7.2% | −7.6% |
| 0.40 | −9.6% | −10.1% | −13.3% | −9.0% | −9.5% |

<sub>Against the ideal tracker at the same site, no rotation limit, 2001–2025 NASA series.</sub>

Backtracking only acts at low sun. At GCR 0.1 it starts with the sun below about 6°, yet it still costs 2.2% at Lisbon. That is the light the model puts at low sun: about 4 times PVGIS's share of the year's DNI below 5° (see [above](#beam-at-low-sun-issue-51)). The losses in the table are therefore too large, by an amount no available reference can pin down, because PVGIS has no backtracking. The ideal tracker overrates the gain and backtracking overrates the loss, so the card's yield with backtracking (Warsaw 1138 kWh/kWp, +8.9% over the fixed array; Lisbon 1858, +16.6%) is uncertain by several percent in either direction. The card's tooltip and the AI prompt say so.

**Not modelled:** diffuse light blocked by the neighbouring rows, sloping ground (slope-aware backtracking), and a tracker's cost. The economics stay for the fixed array.

### Year-to-year variability (P50 / P90)

The average year is not the whole story: lenders size a solar farm's debt on **P90**, the annual yield exceeded in 9 years out of 10. The app fetches NASA POWER's month-by-month values for every year since 2001 (the CERES-based record the climatology also comes from; earlier years use another satellite product and would mix two records), runs the same yield model on each year at the surveyed orientation, and reports:

- **P50** = the mean;
- **P90** = mean − 1.2816 σ (normal approximation, the usual convention), where σ combines the weather's year-to-year spread with the uncertainty of the estimate itself ([below](#adding-the-uncertainty-of-the-estimate-issue-43)). The card shows the 1-year P90; the tooltip adds the weather-only P90, its empirical 10th percentile as a check, and the 10-year P90; the economics use the 10-year P90;
- a chart of each year's yield with the P50 and the weather-only P90 lines, years below that P90 in red.

| Site | Years | P50 | Year-to-year σ | P90, weather only | Empirical 10th pct. | **P90, 1 year** | P90, 10 years |
|------|-------|-----|----------------|-------------------|---------------------|-----------------|---------------|
| Warsaw, 35° S | 2001–2025 | 1043 | 4.4% | 984 (−5.6%) | 979 | **965 (−7.4%)** | 989 (−5.2%) |
| Lisbon demo, surveyed 11.9° / 175° | 2001–2025 | 1500 | 2.5% | 1451 (−3.3%) | 1450 | **1412 (−5.9%)** | 1425 (−5.0%) |

<sub>Weather-only P50 / P90 with constant clearness, before issue #41: Warsaw 1030 / 972, Lisbon demo 1489 / 1440. With the isotropic sky, before issue #35: Warsaw 990 / 936, Lisbon demo 1464 / 1417.</sub>

The yield and the P50 now cover the same years. At Warsaw, 35° S, the yield of the 2001–2025 mean year is 1043.1 kWh/kWp and the P50 is 1042.7. The 0.04% between them is the model's non-linearity (temperature derating, the diffuse share): the yield of the average year is not quite the average of the yearly yields. Before issue #39 the yield came from NASA's 2001–2020 climatology, 1026.2, which put it 0.35% below the P50 for no reason but the five extra years.

#### Adding the uncertainty of the estimate (issue #43)

The spread between years is not the only uncertainty: the yield estimate itself, model and satellite irradiance together, can be off. Lenders' energy assessments add it to the weather and quote two numbers:

- **1-year P90**: σ = √(σ_weather² + σ_estimate²). One bad year, for debt service in any single year.
- **10-year P90**: σ = √((σ_weather/√10)² + σ_estimate²). Over ten years the weather averages out, but an error in the estimate does not.

**σ_estimate = 3.8%** of the yield is measured, not assumed. It is the RMS error of the app's model against PVGIS 5.3 at the seven independent equator-facing sites of the [validation](#validation-against-pvgis) (mean error +0.6%), and a test recomputes it. Its limits:

- **PVGIS is a reference, not the truth.** Its own error is inside this number, in one direction or the other.
- **Seven sites are a small sample, and Oslo dominates.** Without Oslo, where NASA's irradiance is 2.5% above PVGIS's, the RMS is 2.3%.
- **It is an extrapolation elsewhere.** Using it at any site on Earth extrapolates from Europe, North Africa, South Africa and Australia, and from a 1 kWp array at the stated orientations.

The two sites in the table show why both numbers matter. In Warsaw the weather varies a lot (σ 4.4%), so the 10-year P90 (989) is above the weather-only P90 (984): averaging ten years removes more uncertainty than the estimate adds. Lisbon's weather is steady (σ 2.5%), so the estimate dominates, and even the 10-year P90 (1425) is well below the weather-only one (1451).

Still left out: the uncertainty of degradation, soiling, availability and curtailment, and any correlation between years. Years NASA has not completed yet are left out of the series.

## Economics (per kWp, your prices)

Prices differ by country and change every year, so the app does not guess them: enter the investment per kWp, what a kWh is worth to you (a tariff, a PPA price or the retail price you avoid) and a real discount rate, in any currency. Everything is per kWp, so no plant size is assumed ([`economics.js`](economics.js)).

With yield *Y* (kWh/kWp in year 1), degradation *d*, O&M cost *M* per year, price *p*, investment *C*, real discount rate *r* and lifetime *L*:

- energy in year *t*: *E<sub>t</sub>* = *Y* (1 − *d*)<sup>*t*−1</sup>; cash in year *t*: *E<sub>t</sub> p* − *M*
- **LCOE** = (*C* + Σ *M* / (1+*r*)<sup>*t*</sup>) / Σ *E<sub>t</sub>* / (1+*r*)<sup>*t*</sup>: selling at the LCOE gives NPV = 0, which the tests check
- **NPV** at *r*, **IRR** (the rate where NPV = 0, by bisection; negative for a project that never earns its investment back), **payback** (years until the cumulative cash turns positive, interpolated within the year)

Each is shown for the **P50** and the **10-year P90** yield (see above): the average yield exceeded with 90% confidence, weather and estimate uncertainty included, applied to every year. It is a cautious case rather than a forecast.

Defaults only where a typical value is defensible: degradation **0.5 % a year** (the median of field measurements in Jordan & Kurtz, "Photovoltaic Degradation Rates — an Analytical Review", NREL 2013) and a **25-year** lifetime (the usual module performance warranty). O&M defaults to 0. Investment, energy value and discount rate have no default.

Left out: taxes and depreciation, subsidies, loans and their terms, inflation beyond the real rate, inverter replacement, decommissioning, and any change in the value of energy over time.

### Tracker against fixed (issue #55)

How much more a tracker costs than a fixed structure is not settled. The Berkeley Lab "Utility-Scale Solar" editions and the articles about them put the US premium above zero, at about zero or even below it, depending on the year and the source, and the 2024 executive summary gives no figure. So the app does not assume one. It answers the question that needs no premium:

**Break-even extra investment.** NPV is linear in the investment, so a tracker has the same NPV as the fixed array when it costs

Δ*C*\* = NPV<sub>tracker</sub>(*C*, *M* + Δ*M*) − NPV<sub>fixed</sub>(*C*, *M*)

more per kWp. The two NPVs use the same price, rate, degradation and lifetime, each its own P50 yield, and the tracker's extra O&M Δ*M* (optional, 0 if blank). A negative value means the tracker loses even at no extra cost. A test checks that at Δ*C*\* the two NPVs are equal. Without degradation, Δ*C*\* reduces to (*p* ΔY − Δ*M*) × the annuity factor, and a second test checks that.

For example, at Warsaw (fixed P50 1043, tracker 1138 kWh/kWp at GCR 0.33) the break-even is 99 per kWp with these prices, which are only an illustration: 650 per kWp, 0.08 per kWh, O&M 12 a year, 6% real, 30 years, 0.5%/yr degradation. With 3 a year of extra O&M for the tracker it is 58.

**With the actual extra investment** entered, the tracker gets its own column: LCOE, payback, NPV and IRR. The whole-site rows compare each layout at its own MWp on the same land, because a tracker layout fits a different capacity (GCR 0.33 against the fixed rows' GCR). So a tracker can win per kWp and lose per site, or the reverse.

**How far to trust it.** The tracker yield is uncertain by several percent in either direction (the ideal tracker overrates the gain, and backtracking overrates the loss; see [Single-axis tracker](#single-axis-tracker-issue-49)). In the example, 1% more tracker yield raises the break-even by 12 per kWp, so ±5% moves it by about ±60, against 99. Read the break-even as an order of magnitude to compare with real quotes. There is no tracker P90, because its year-to-year series is not computed.

## Terrain from the survey (issue #63)

The `slope` and `azimuth` columns describe each point, and the CSV format leaves open whether they mean the ground or the panels. The survey's heights also describe the ground as a whole, and that matters for a solar site: an equator-facing slope lets rows stand closer, and tracker rows follow the north–south grade. So [`geometry.js`](geometry.js) fits a plane, z = a + b·east + c·north, through every point with an elevation, by least squares. The **Terrain** card shows:
- **Slope:** the plane's steepest slope.
- **Falls towards:** the compass direction downhill.
- **Grade:** the rise per 100 m going north and going east.
- **Fit:** the RMS of the heights about the plane. A large value means uneven ground or an elevation outlier; the plane does not down-weight the outliers that the per-point flags show.

The heights come from the survey, not the DEM. The horizon's Copernicus GLO-90 cells are 90 m across, about the size of a whole site. The surveyed heights describe the ground far better and need no request.

**Local metres:** east and north about the points' centroid, from the WGS84 radii of curvature, with the parallel's curvature to second order and longitudes wrapped at ±180°. Against pyproj's exact local tangent plane (geodetic → ECEF → east-north-up), a 3 × 3 km site at 60° N is off by at most 2 mm. The plane matches numpy's least squares at three test sites, one of them across the antimeridian. Both references are recorded by [`test/fixtures/make-terrain-plane.py`](test/fixtures/make-terrain-plane.py).

**No plane:** fewer than three heights, or points along one line. A transect gives the slope along it only, so the spread across the line must be at least 5% of the spread along it, as a ratio of the principal standard deviations. The demo survey is such a transect, so its Terrain card stays empty.

No pass/fail threshold is set (no "too steep" flag) without a source for the limit, and the yield does not use the plane. The row layout does ([below](#rows-on-sloping-ground-issue-65)). The GeoJSON site boundary carries `terrain_slope_deg`, `terrain_aspect_deg`, `terrain_grade_north_pct`, `terrain_grade_east_pct` and `terrain_rms_m`.

## Site capacity (issue #45)

Everything above is per kWp. The capacity card turns it into the whole site:

**kWp = area × usable share × GCR × module efficiency × 1 kW/m²**

- **Area**: the convex hull of the survey points, the same as the "Site Area" card.
- **Usable share** (Configuration, default 100%): what is left for rows after roads, setbacks and inverter stations. At 100% the result is gross.
- **GCR**, the ground coverage ratio (module area over ground area), follows from the row spacing the app already suggests. Rows are spaced so that one does not shade the next at winter-solstice noon: a row of slant height *h* at tilt β needs a pitch of *h* (cos β + sin β / tan α), with α the sun's elevation then, 90° − (|latitude| + 23.45°). So GCR = 1 / (cos β + sin β / tan α), and the row height cancels out ([`capacity.js`](capacity.js)).
- **Module efficiency** (Configuration, default 21%): the watts per m² of module at standard test conditions. Current crystalline-silicon modules are at about 20–23%.

The tilt β is the same one the yield and the P50/P90 use: the surveyed slope, or the optimal tilt where the file has none. The row count uses it too; before this change it used the optimal tilt. Energy is kWp × the per-kWp P50 and 1-year P90. The economics table adds the site's investment, energy, first-year revenue and NPV: the per-kWp results × kWp.

| Example | Tilt | α at winter noon | GCR | Land per MWp (21%, gross) |
|---|---:|---:|---:|---:|
| Warsaw, optimal tilt | 39° | 14.3° | 0.31 | 1.54 ha |
| Lisbon, 35° | 35° | 27.8° | 0.52 | 0.91 ha |
| Lisbon demo, surveyed 11.9° | 11.9° | 27.8° | 0.73 | 0.65 ha |

The demo's 0.12 ha hold 177 kWp, 266 MWh a year at P50.

**Limits.** The survey points' hull stands in for the parcel, which is usually larger. Shading between rows is avoided only at winter noon: mornings and evenings in winter, at a dense layout, lose some yield that is not modelled. The `slope` column is read as the panel tilt, so a sloping field is treated as panels at that slope. The capacity is DC: no inverter sizing, AC limit or grid connection. This card is for fixed-tilt rows. The [tracker card](#tracker-rows-and-backtracking-issue-53) gives the capacity of a tracker layout at its own GCR.

### Rows on sloping ground (issue #65)

Where the survey gives a [terrain plane](#terrain-from-the-survey-issue-63), the rows follow its north–south grade *g*, the rise per metre going away from the equator (positive on an equator-facing slope). One row does not shade the next at winter-solstice noon if the horizontal pitch is

**h (sin β + cos β tan α) / (tan α + g)**

with the tilt β from horizontal. At *g* = 0 this is the flat rule above. So the GCR scales by exactly 1 + *g* / tan α, which is a lot where the winter sun is low:

| Example | g = −5% | flat | g = +5% |
|---|---:|---:|---:|
| Warsaw, 39° | 0.25 | 0.31 | 0.37 |
| Lisbon, 35° | 0.48 | 0.52 | 0.57 |

Tests compare the pitch with pvlib's `shaded_fraction1d` at 24 combinations of latitude, tilt and grade on both hemispheres. The reference ([`make-row-pitch-pvlib.py`](test/fixtures/make-row-pitch-pvlib.py)) does not use the formula: it searches for the smallest pitch that pvlib reports as unshaded. They agree to 10⁻⁶ of the row height.

The row count, the capacity, the energy and the site's economics all use it. The capacity tooltip, the AI prompt and the GeoJSON (`row_grade_pct`, `capacity_flat_kwp`) give the flat-ground value next to it. Without a plane the ground counts as flat, as before.

- **No layout** where the sun at that noon is not more than 3° up, or where tan α + *g* ≤ tan 3°: the slope hides the winter sun.
- **GCR ≤ 1.** It is capped where the ground is about as steep as the panels. The cap also fixes steep panels near the equator, which gave a GCR above 1 on flat ground and an error instead of a capacity.
- **The plane is an average.** On uneven ground (a large RMS on the Terrain card) single rows differ.
- **The east–west grade does not enter:** rows run east–west and follow the ground along their length.
- **The tracker card stays on flat ground.**
- **A `slope` column that means the ground:** it is still read as the panel tilt, so such a file describes panels flush with the ground. On an equator-facing site the GCR then reaches its cap and the capacity is the most the ground could carry.

## Bifacial modules (issue #67)

Enter the modules' **bifaciality**, the rear's efficiency relative to the front from the datasheet, in Configuration. The **Bifacial** card then shows the fixed rows' yield with the rear side and the gain over monofacial modules. The rows are those of the capacity card: same tilt, azimuth and ground coverage ratio.

The rear's irradiation comes from a 2-D model of long, evenly spaced rows on flat ground, the "infinite sheds" of Mikofski et al. (2019) that pvlib implements ([`solar-model.js`](solar-model.js), `rearDayIrradiation`). It is spread over the mean day like the front side. Moment by moment, the rear receives three parts:
- **Sky:** the isotropic sky through the gap between its row and the row behind. In 2-D the view factor is closed-form, from Hottel's crossed strings.
- **Ground:** light reflected from the ground between the rows. The ground has a sunlit share, the pitch minus the rows' shadows, and its own view of the sky past the rows. That view is integrated numerically over the pitch, from the angles the rows hide.
- **Beam from behind:** when the sun is behind the rows, early and late in summer, minus the part of the rear that the row behind shades.

With the Hay–Davies sky, the circumsolar share counts as beam. Yield = front + bifaciality × (1 − 2% for the racking behind the modules, pvlib's default) × rear, with the same losses and temperature as the front.

**Checked against pvlib 0.16.1** `bifacial.infinite_sheds.get_irradiance_poa`, given the app's own mean-day moments as input ([`tools/bifacial-moments.mjs`](tools/bifacial-moments.mjs), [`make-bifacial-pvlib.py`](test/fixtures/make-bifacial-pvlib.py)). Over 7 sites × 12 months × 4 row geometries (GCR 0.25–0.6, albedo 0.2–0.5), each geometry's yearly rear irradiation agrees within 0.03%, and so do the sky, ground and beam parts separately. pvlib computes its view factors with its own exact integrals, so the check covers the geometry, not just the arithmetic.

| Gain at bifaciality 0.8, albedo 0.2 | Tilt | GCR | Gain |
|---|---:|---:|---:|
| Warsaw | 39° | 0.31 | +10.3% |
| Lisbon | 35° | 0.52 | +6.2% |
| Cairo | 27° | 0.66 | +4.5% |

**Limits.**
- **The ground is averaged.** Like pvlib's, the model takes the ground's brightness as uniform across the pitch. In an infinite array, the average sky view of the ground then does not depend on the rows' height: pvlib gives the same value to 10⁻¹² for heights from 0.4 to 4 row widths. So the height does not enter the model, although real rows mounted higher get a more evenly lit ground under them. There is therefore no height setting.
- **Not modelled:** light reflected by other rows, the rear's glass reflection loss, row ends, trackers and sloping ground.
- **Assumed albedo:** the app's 0.2.
- **No field data.** The check is against pvlib only, so it shows that the geometry is computed right, not that the gain is what a real plant measures.
- **Monofacial elsewhere:** the capacity card's energy, the economics and the P90 stay monofacial.

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
- **Claude API** (Opus 5.5 / Sonnet 5.5 / Haiku 5.5 with your key, [`claude-request.js`](claude-request.js); Haiku 5.5 through the backend) — AI site analysis and follow-up chat
- **Google Cloud Run + Firestore + Anthropic workload identity federation** — the keyless AI backend in `server/` (Node, `@anthropic-ai/sdk`)
- **`node --test`** — tests for the yield model (including the PVGIS validation above), the CSV parser, the site geometry and the GeoJSON/print exports; run `node --test` from the repo root
- **GitHub Pages** — hosting

## Background

During my Erasmus+ internship in Portugal, I performed geodetic surveys for solar farm planning — collecting slope, azimuth, and coordinate data across multiple sites. This tool automates the analysis step that previously required manual spreadsheet work and domain expertise.

## License

MIT
