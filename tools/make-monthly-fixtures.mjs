// Records NASA POWER month-by-month series for the PVGIS validation sites (issue #39):
//   node tools/make-monthly-fixtures.mjs   → test/fixtures/nasa-power-monthly-<site>.json
// Before saving, it checks that the coordinates fall in the same grid cell as the site's
// recorded climatology fixture: today's climatology there must equal it value for value.
// One request at a time, with a pause, as NASA asks of automated clients.
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const M = require('../solar-model.js');
const fixture = (name) => fileURLToPath(new URL('../test/fixtures/' + name, import.meta.url));
const headers = { 'User-Agent': 'solar-site-intelligence validation probe' };
const today = new Date().toISOString().slice(0, 10);
const lastYear = new Date().getUTCFullYear() - 1;
const pause = (ms) => new Promise(r => setTimeout(r, ms));

const SITES = {
  oslo: [59.91, 10.75], cairo: [30.04, 31.24], sydney: [-33.87, 151.21],
  madrid: [40.42, -3.70], johannesburg: [-26.2, 28.04],
};

async function fetchJson(url) {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(url, { headers });
      if (!r.ok) throw new Error(`HTTP ${r.status} ${(await r.text()).slice(0, 100)}`);
      return await r.json();
    } catch (err) {
      if (i === 3) throw err;
      console.warn(`  ${err.message}; retrying in ${30 * i} s`);
      await pause(30_000 * i);
    }
  }
}

for (const [site, [lat, lon]] of Object.entries(SITES)) {
  const recorded = M.parsePowerClimatology(require(fixture(`nasa-power-${site}.json`)));
  const now = M.parsePowerClimatology(await fetchJson(M.powerClimatologyUrl(lat, lon)));
  const same = ['ghi', 'diffuse', 'temp'].every(k => now[k].every((v, m) => v === recorded[k][m]));
  if (!same) throw new Error(`${site}: ${lat}, ${lon} is not the grid cell of the recorded climatology`);
  await pause(5_000);
  const json = await fetchJson(M.powerMonthlyUrl(lat, lon, lastYear));
  const years = M.parsePowerMonthly(json);
  writeFileSync(fixture(`nasa-power-monthly-${site}.json`), JSON.stringify({
    source: `NASA POWER monthly API ${json.header?.api?.version ?? ''}, ${site} (${lat}, ${lon}), ` +
      `${years[0].year}-${years.at(-1).year}, retrieved ${today}`,
    properties: json.properties,
  }) + '\n');
  console.log(`${site}: ${years.length} complete years, ${years[0].year}–${years.at(-1).year}`);
  await pause(5_000);
}
