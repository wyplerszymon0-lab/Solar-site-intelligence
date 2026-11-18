// Records the hourly validation data (issue #57). Run from the repo root:
//   node tools/make-hourly-fixture.mjs   → test/fixtures/hourly-2020.json.gz
// For the seven validation sites and the year 2020:
//  - NASA POWER hourly GHI, diffuse and DNI (Wh/m² in the hour starting at each UTC stamp,
//    rounded to whole numbers) and T2M (tenths of °C), as compact integer arrays;
//  - PVGIS 5.3 seriescalc for the same year (1 kWp, 14 % loss, no horizon): only the annual
//    sum of P for an equator-facing array at the site's validation tilt, east and west at 35°
//    and the horizontal N–S tracker. The tracker is trackingtype=5 (inclined axis) at 0° slope, the
//    same mounting as the PVcalc reference of issue #49: trackingtype=1 (horizontal N–S axis) gave
//    Sydney (PVGIS-ERA5) 1360 kWh/kWp, below its fixed array, against 1849 for type 5.
// One request at a time, with pauses, as both services ask of automated clients.
import { writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const out = fileURLToPath(new URL('../test/fixtures/hourly-2020.json.gz', import.meta.url));
const headers = { 'User-Agent': 'solar-site-intelligence validation probe' };
const today = new Date().toISOString().slice(0, 10);
const pause = (ms) => new Promise(r => setTimeout(r, ms));
const YEAR = 2020;

// name, lat, lon, validation tilt (as in test/solar-model.test.js)
const SITES = [
  ['lisbon', 38.72, -9.14, 35], ['warsaw', 52.23, 21.01, 47], ['oslo', 59.91, 10.75, 54],
  ['cairo', 30.04, 31.24, 27], ['sydney', -33.87, 151.21, 30], ['madrid', 40.42, -3.70, 36],
  ['johannesburg', -26.2, 28.04, 24],
];

async function fetchJson(url) {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(url, { headers });
      if (!r.ok) throw new Error(`HTTP ${r.status} ${(await r.text()).slice(0, 100)}`);
      return JSON.parse(await r.text()); // whole body first: a truncated response fails here
    } catch (err) {
      if (i === 4) throw err;
      console.warn(`  ${err.message}; retrying in ${15 * i} s`);
      await pause(15_000 * i);
    }
  }
}

const nasaUrl = (lat, lon) => 'https://power.larc.nasa.gov/api/temporal/hourly/point' +
  '?parameters=ALLSKY_SFC_SW_DWN,ALLSKY_SFC_SW_DIFF,ALLSKY_SFC_SW_DNI,T2M&community=RE' +
  `&latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&start=${YEAR}0101&end=${YEAR}1231&format=JSON&time-standard=UTC`;
const pvgisUrl = (lat, lon, mounting) => `https://re.jrc.ec.europa.eu/api/v5_3/seriescalc?lat=${lat}&lon=${lon}` +
  `&${mounting}&startyear=${YEAR}&endyear=${YEAR}&pvcalculation=1&peakpower=1&loss=14&usehorizon=0&outputformat=json`;

const sites = [];
for (const [name, lat, lon, tilt] of SITES) {
  const nasa = await fetchJson(nasaUrl(lat, lon));
  const p = nasa.properties.parameter;
  const keys = Object.keys(p.ALLSKY_SFC_SW_DWN).sort();
  if (keys.length !== 8784 || keys[0] !== `${YEAR}010100`) throw new Error(`${name}: unexpected hours ${keys.length} from ${keys[0]}`);
  const col = (param, scale) => keys.map(k => (p[param][k] < -900 ? null : Math.round(p[param][k] * scale)));
  const record = {
    name, lat, lon, tilt,
    nasa: {
      api: nasa.header?.api?.version ?? null, start: `${YEAR}-01-01T00:00Z`,
      ghi: col('ALLSKY_SFC_SW_DWN', 1), diffuse: col('ALLSKY_SFC_SW_DIFF', 1), dni: col('ALLSKY_SFC_SW_DNI', 1),
      t2m: col('T2M', 10),
    },
    pvgis: {},
  };
  console.log(name, 'NASA', record.nasa.api, 'GHI', (record.nasa.ghi.reduce((s, v) => s + (v ?? 0), 0) / 1000).toFixed(0), 'kWh/m²');
  await pause(3000);
  const equator = lat >= 0 ? 0 : 180; // PVGIS aspect: 0 = south, ±180 = north
  for (const [key, mounting] of [['equator', `angle=${tilt}&aspect=${equator}`], ['east', 'angle=35&aspect=-90'],
    ['west', 'angle=35&aspect=90'], ['tracker', 'trackingtype=5&angle=0']]) {
    const json = await fetchJson(pvgisUrl(lat, lon, mounting));
    if (json.outputs.hourly.length !== 8784) throw new Error(`${name} ${key}: ${json.outputs.hourly.length} hours`);
    record.pvgis[key] = Math.round(json.outputs.hourly.reduce((s, h) => s + h.P, 0)) / 1000; // kWh/kWp
    record.pvgis.radiationDb = json.inputs.meteo_data.radiation_db;
    console.log('  PVGIS', key, record.pvgis[key]);
    await pause(3000);
  }
  sites.push(record);
}
writeFileSync(out, gzipSync(JSON.stringify({
  source: `NASA POWER hourly (UTC, values for the hour starting at each stamp) and PVGIS 5.3 seriescalc ` +
    `annual sums (1 kWp, 14% loss, no horizon), ${YEAR}; recorded ${today}`,
  year: YEAR, sites,
})));
console.log('written', out);
