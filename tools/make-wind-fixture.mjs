// Records hourly wind for the hourly temperature study (issue #61). Run from the repo root:
//   node tools/make-wind-fixture.mjs   → test/fixtures/hourly-wind-2020.json.gz
// NASA POWER hourly WS10M (wind speed at 10 m, m/s, UTC stamps as in hourly-2020.json.gz) for
// the seven validation sites and 2020, in tenths of m/s. PVGIS's methods page does not say
// which height its Faiman temperature model uses: 10 m is an assumption of the study.
// One request at a time, with pauses, as NASA asks of automated clients.
import { writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const out = fileURLToPath(new URL('../test/fixtures/hourly-wind-2020.json.gz', import.meta.url));
const headers = { 'User-Agent': 'solar-site-intelligence validation probe' };
const today = new Date().toISOString().slice(0, 10);
const pause = (ms) => new Promise(r => setTimeout(r, ms));
const YEAR = 2020;

// The sites of tools/make-hourly-fixture.mjs.
const SITES = [
  ['lisbon', 38.72, -9.14], ['warsaw', 52.23, 21.01], ['oslo', 59.91, 10.75], ['cairo', 30.04, 31.24],
  ['sydney', -33.87, 151.21], ['madrid', 40.42, -3.70], ['johannesburg', -26.2, 28.04],
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

const sites = [];
for (const [name, lat, lon] of SITES) {
  const json = await fetchJson('https://power.larc.nasa.gov/api/temporal/hourly/point?parameters=WS10M&community=RE' +
    `&latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&start=${YEAR}0101&end=${YEAR}1231&format=JSON&time-standard=UTC`);
  const p = json.properties.parameter.WS10M;
  const keys = Object.keys(p).sort();
  if (keys.length !== 8784 || keys[0] !== `${YEAR}010100`) throw new Error(`${name}: unexpected hours ${keys.length} from ${keys[0]}`);
  const ws10m = keys.map(k => (p[k] < -900 ? null : Math.round(p[k] * 10)));
  sites.push({ name, lat, lon, api: json.header?.api?.version ?? null, start: `${YEAR}-01-01T00:00Z`, ws10m });
  console.log(name, 'mean wind', (ws10m.reduce((s, v) => s + (v ?? 0), 0) / 10 / ws10m.length).toFixed(2), 'm/s');
  await pause(3000);
}
writeFileSync(out, gzipSync(JSON.stringify({
  source: `NASA POWER hourly WS10M (m/s ×10, UTC), ${YEAR}; recorded ${today}`, year: YEAR, sites,
})));
console.log('written', out);
