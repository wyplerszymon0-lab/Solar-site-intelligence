// Inputs for the pvlib reference of the bifacial rear model (issue #67). Run from the repo root:
//   node tools/bifacial-moments.mjs > bifacial-moments.json
//   python test/fixtures/make-bifacial-pvlib.py bifacial-moments.json > test/fixtures/bifacial-pvlib.json
// For each validation site, month and row geometry, the mean day's moments as the app spreads
// them (dayMoments): sun zenith and compass azimuth, and the horizontal beam (with the
// Hay–Davies circumsolar share) and isotropic diffuse irradiation of each moment. pvlib then
// computes the rear irradiance moment by moment with these same inputs, so only the rear
// geometry is compared. The JSON is an intermediate file and is not committed.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const M = require('../solar-model.js');

const DEG = Math.PI / 180;
// name, lat, validation tilt (test/solar-model.test.js), azimuth facing the equator
const SITES = [['lisbon', 38.72, 35], ['warsaw', 52.23, 47], ['oslo', 59.91, 54], ['cairo', 30.04, 27],
  ['sydney', -33.87, 30], ['madrid', 40.42, 36], ['johannesburg', -26.2, 24]];
export const GEOMETRIES = [
  { gcr: 0.4, height: 1.0, albedo: 0.2 }, { gcr: 0.4, height: 1.0, albedo: 0.5 },
  { gcr: 0.6, height: 0.6, albedo: 0.2 }, { gcr: 0.25, height: 1.5, albedo: 0.3 },
];

const cases = [];
for (const [name, lat, tilt] of SITES) {
  const c = M.parsePowerClimatology(require(`../test/fixtures/nasa-power-${name}.json`));
  const az = lat >= 0 ? 180 : 0, phi = lat * DEG;
  M.MEAN_DAY.forEach((n, m) => {
    const H = c.ghi[m], Hd = Math.min(c.diffuse[m], H), H0 = M.extraterrestrialDaily(lat, n);
    const A = H0 > 0 ? Math.min(1, (H - Hd) / H0) : 0;
    const d = (23.45 * Math.sin(2 * Math.PI * (284 + n) / 365)) * DEG;
    const moments = M.dayMoments(phi, d, { H, Hd, profile: 'collares-pereira-rabl' });
    const beamWeight = moments.reduce((s, x) => s + x.beam, 0);
    const rows = moments.map(x => {
      const Dh = Hd * x.diffuse, Bh = beamWeight > 0 ? Math.max(0, H - Hd) * x.beam / beamWeight : 0;
      const azSouth = Math.atan2(Math.sin(x.omega) * Math.cos(d), Math.sin(phi) * Math.cos(d) * Math.cos(x.omega) - Math.cos(phi) * Math.sin(d));
      return [Math.acos(x.cosZ) / DEG, (azSouth / DEG + 180 + 360) % 360, Bh + A * Dh, Dh - A * Dh];
    });
    for (const g of GEOMETRIES) cases.push({ name, lat, tilt, azimuth: az, month: m, ...g, moments: rows });
  });
}
process.stdout.write(JSON.stringify({ cases }));
