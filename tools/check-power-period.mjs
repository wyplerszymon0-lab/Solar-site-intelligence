// Which years does NASA POWER's climatology really average? (issue #37)
// The header has said "2001 - December 2025" since late 2026, while the values stayed the
// 2001–2020 means. This asks the live API for a site's climatology and its month-by-month
// series, and reports which period's means the climatology matches. Run from the repo root:
//   node tools/check-power-period.mjs                → Warsaw and Lisbon
//   node tools/check-power-period.mjs 46.0 7.7 ...   → any lat/lon pairs
// When the answer is no longer 2001–2020, update the app's source label and the README.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const M = require('../solar-model.js');
const headers = { 'User-Agent': 'solar-site-intelligence validation probe' };

async function fetchJson(url) {
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${(await r.text()).slice(0, 100)}`);
  return r.json();
}

const args = process.argv.slice(2).map(Number);
const sites = args.length >= 2
  ? Array.from({ length: Math.floor(args.length / 2) }, (_, i) => [args[2 * i], args[2 * i + 1]])
  : [[52.2297, 21.0122], [38.72, -9.14]];
const lastYear = new Date().getUTCFullYear() - 1;

for (const [lat, lon] of sites) {
  const response = await fetchJson(M.powerClimatologyUrl(lat, lon));
  const clim = M.parsePowerClimatology(response);
  const years = M.parsePowerMonthly(await fetchJson(M.powerMonthlyUrl(lat, lon, lastYear)));
  // Largest monthly GHI difference between the climatology and the mean of 2001…last.
  const gap = (last) => {
    const kept = years.filter(y => y.year <= last);
    return Math.max(...clim.ghi.map((v, m) => Math.abs(kept.reduce((s, y) => s + y.ghi[m], 0) / kept.length - v)));
  };
  const candidates = years.map(y => y.year).filter(y => y >= M.FIRST_SERIES_YEAR + 9);
  const best = candidates.reduce((a, b) => (gap(b) < gap(a) ? b : a));
  console.log(`${lat}, ${lon}: header says "${response.header?.range ?? 'no period'}"`);
  console.log(`  values match the 2001–${best} means (largest monthly GHI gap ${gap(best).toFixed(4)} kWh/m²/day;` +
    ` 2001–${years.at(-1).year}: ${gap(years.at(-1).year).toFixed(4)})`);
}
