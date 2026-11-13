// Records how PVGIS spreads the year's direct normal irradiation over sun elevations (issue #51):
//   node tools/make-dni-fixture.mjs   → test/fixtures/pvgis-dni-by-elevation.json
// PVGIS 5.3 seriescalc, one year, horizontal plane with components, no horizon. For each
// hour with the sun up, DNI = Gb(i) / sin(H_sun); only the sums per elevation bin are kept.
// One request per site (about 1 MB each), with a pause.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const out = fileURLToPath(new URL('../test/fixtures/pvgis-dni-by-elevation.json', import.meta.url));
const headers = { 'User-Agent': 'solar-site-intelligence validation probe' };
const today = new Date().toISOString().slice(0, 10);
const pause = (ms) => new Promise(r => setTimeout(r, ms));
const YEAR = 2020;
const BINS = [0, 5, 10, 15, 20, 30, 45, 90]; // degrees of sun elevation
const SITES = [['lisbon', 38.72, -9.14], ['warsaw', 52.23, 21.01], ['johannesburg', -26.2, 28.04]];

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
for (const [name, lat, lon] of SITES) {
  const json = await fetchJson(`https://re.jrc.ec.europa.eu/api/v5_3/seriescalc?lat=${lat}&lon=${lon}` +
    `&angle=0&aspect=0&startyear=${YEAR}&endyear=${YEAR}&components=1&usehorizon=0&outputformat=json`);
  const dni = new Array(BINS.length - 1).fill(0), beam = new Array(BINS.length - 1).fill(0);
  for (const h of json.outputs.hourly) {
    const e = h.H_sun;
    if (!(e > 0)) continue;
    const i = BINS.findIndex((b, k) => e >= b && e < BINS[k + 1]);
    dni[i] += h['Gb(i)'] / Math.sin(e * Math.PI / 180);
    beam[i] += h['Gb(i)'];
  }
  const kwh = (xs) => xs.map(v => Math.round(v) / 1000);
  sites.push({ name, lat, lon, radiationDb: json.inputs.meteo_data.radiation_db, dniKwh: kwh(dni), horizontalBeamKwh: kwh(beam) });
  console.log(name, kwh(dni).join(' '));
  await pause(2000);
}
writeFileSync(out, JSON.stringify({
  source: `PVGIS 5.3 seriescalc ${YEAR}, horizontal, components, no horizon; DNI = Gb(i) / sin(H_sun) summed per sun-elevation bin, kWh/m²; recorded ${today}`,
  bins: BINS, sites,
}, null, 1) + '\n');
