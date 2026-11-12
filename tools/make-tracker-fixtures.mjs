// Records the PVGIS single-axis tracker references (issue #49). Run from the repo root:
//   node tools/make-tracker-fixtures.mjs   → test/fixtures/pvgis-tracker.json
// PVGIS 5.3 PVcalc, 1 kWp, 14 % losses, its default horizon (as for the fixed-array
// validation): the fixed array at each site's validation tilt next to an inclined-axis
// tracker at 0° slope, i.e. a horizontal north–south axis. One request per site, with a pause.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const out = fileURLToPath(new URL('../test/fixtures/pvgis-tracker.json', import.meta.url));
const headers = { 'User-Agent': 'solar-site-intelligence validation probe' };
const today = new Date().toISOString().slice(0, 10);
const pause = (ms) => new Promise(r => setTimeout(r, ms));

// name, lat, lon, fixed tilt, PVGIS aspect (0 = equator-facing in the north, 180 in the south)
const SITES = [
  ['lisbon', 38.72, -9.14, 35, 0], ['warsaw', 52.23, 21.01, 47, 0], ['oslo', 59.91, 10.75, 54, 0],
  ['cairo', 30.04, 31.24, 27, 0], ['sydney', -33.87, 151.21, 30, 180], ['madrid', 40.42, -3.70, 36, 0],
  ['johannesburg', -26.2, 28.04, 24, 180],
];

async function fetchJson(url) {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(url, { headers });
      if (!r.ok) throw new Error(`HTTP ${r.status} ${(await r.text()).slice(0, 100)}`);
      return await r.json();
    } catch (err) {
      if (i === 3) throw err;
      console.warn(`  ${err.message}; retrying in ${10 * i} s`);
      await pause(10_000 * i);
    }
  }
}

const sites = [];
for (const [name, lat, lon, tilt, aspect] of SITES) {
  const json = await fetchJson(`https://re.jrc.ec.europa.eu/api/v5_3/PVcalc?lat=${lat}&lon=${lon}` +
    `&peakpower=1&loss=14&angle=${tilt}&aspect=${aspect}&inclined_axis=1&inclinedaxisangle=0&outputformat=json`);
  const { totals, monthly } = json.outputs;
  const pick = (key) => ({ E_y: totals[key].E_y, 'H(i)_y': totals[key]['H(i)_y'], E_m: monthly[key].map(m => m.E_m) });
  sites.push({ name, lat, lon, tilt, radiationDb: json.inputs.meteo_data.radiation_db,
    fixed: pick('fixed'), tracker: pick('inclined_axis') });
  console.log(name, totals.fixed.E_y, totals.inclined_axis.E_y);
  await pause(2000);
}
writeFileSync(out, JSON.stringify({
  source: `PVGIS 5.3 PVcalc (1 kWp, 14% loss, default horizon; fixed array and inclined_axis=1 at 0° slope), recorded ${today}`,
  sites,
}, null, 1) + '\n');
