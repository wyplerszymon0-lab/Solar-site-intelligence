// Records the horizon test fixtures. Run from the repo root:
//   node tools/make-horizon-fixtures.mjs terrain   → test/fixtures/horizon-zermatt.json (577 Open-Meteo heights; mind its ~600/min limit)
//   node tools/make-horizon-fixtures.mjs physics   → test/fixtures/horizon-physics-pvgis.json (PVGIS + NASA POWER only)
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const H = require('../horizon.js');
const M = require('../solar-model.js');
const out = (name) => fileURLToPath(new URL('../test/fixtures/' + name, import.meta.url));
const today = new Date().toISOString().slice(0, 10);

async function fetchJson(url) {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status} ${(await r.text()).slice(0, 100)}`);
      return await r.json();
    } catch (err) {
      if (i >= 4) throw err;
      await new Promise(res => setTimeout(res, 4000));
    }
  }
}

// PVGIS azimuth: 0 = south, −90 = east → compass = A + 180; one value per 7.5°.
async function pvgisHorizon(lat, lon) {
  const prof = (await fetchJson(`https://re.jrc.ec.europa.eu/api/v5_3/printhorizon?lat=${lat}&lon=${lon}&outputformat=json`)).outputs.horizon_profile;
  const byCompass = new Map(prof.map(p => [((p.A + 180) % 360 + 360) % 360, p.H_hor]));
  return Array.from({ length: 48 }, (_, i) => byCompass.get(i * 7.5));
}

if (process.argv[2] === 'terrain') {
  const [lat, lon] = [46.0207, 7.7491]; // Zermatt
  const elevations = [];
  for (const url of H.elevationUrls(H.samplePoints(lat, lon))) elevations.push(...(await fetchJson(url)).elevation);
  writeFileSync(out('horizon-zermatt.json'), JSON.stringify({
    source: `Open-Meteo elevation API (Copernicus DEM GLO-90) and PVGIS 5.3 printhorizon, recorded ${today}`,
    lat, lon, elevations, pvgis: await pvgisHorizon(lat, lon),
  }) + '\n');
} else if (process.argv[2] === 'physics') {
  const sites = [['Zermatt', 46.0207, 7.7491], ['Innsbruck', 47.2692, 11.4041], ['Chamonix', 45.9237, 6.8694],
    ['Hallstatt', 47.5622, 13.6493], ['Bergen', 60.3913, 5.3221]];
  const rows = [];
  for (const [name, lat, lon] of sites) {
    const pv = async (h) => (await fetchJson(`https://re.jrc.ec.europa.eu/api/v5_3/PVcalc?lat=${lat}&lon=${lon}` +
      `&peakpower=1&loss=14&angle=35&aspect=0&usehorizon=${h}&outputformat=json`)).outputs.totals.fixed.E_y;
    const clim = await fetchJson(M.powerClimatologyUrl(lat, lon));
    rows.push({ name, lat, lon, pvgisOpen: await pv(0), pvgisShaded: await pv(1), pvgisHorizon: await pvgisHorizon(lat, lon),
      climatology: { properties: { parameter: clim.properties.parameter } } });
  }
  writeFileSync(out('horizon-physics-pvgis.json'), JSON.stringify({
    source: `PVGIS 5.3 PVcalc (1 kWp, 35° south, 14% loss, usehorizon 0/1) and printhorizon; NASA POWER climatology; recorded ${today}`,
    sites: rows,
  }) + '\n');
} else {
  console.error('usage: node tools/make-horizon-fixtures.mjs terrain|physics');
  process.exit(1);
}
