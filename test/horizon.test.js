// Run with: node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../horizon.js');
const M = require('../solar-model.js');

const N = 1 + H.DIRECTIONS * H.DISTANCES_M.length;
const close = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test('577 sample points in batches of 100, the site first', () => {
  const pts = H.samplePoints(46, 7.7);
  assert.equal(pts.length, 577);
  assert.deepEqual(pts[0], [46, 7.7]);
  const urls = H.elevationUrls(pts);
  assert.equal(urls.length, 6);
  assert.equal(urls[0].split('latitude=')[1].split('&')[0].split(',').length, 100);
  assert.equal(urls[5].split('latitude=')[1].split('&')[0].split(',').length, 77);
});

test('destination: 1 km north and east on the sphere', () => {
  const [latN, lonN] = H.destination(0, 0, 0, 1000);
  close(latN, 1000 / 6371000 / (Math.PI / 180), 1e-9);
  close(lonN, 0, 1e-12);
  const [latE, lonE] = H.destination(60, 10, 90, 1000);
  close(lonE - 10, 1000 / (6371000 * Math.cos(60 * Math.PI / 180)) / (Math.PI / 180), 1e-6);
  assert.ok(latE < 60 && latE > 59.9999); // a great circle bends towards the equator
});

test('flat terrain has an open horizon: the curve of the Earth only lowers it', () => {
  assert.deepEqual(H.profileFromElevations(new Array(N).fill(200)), new Array(48).fill(0));
});

test('a ridge in one direction gives its angle there and nowhere else', () => {
  const e = new Array(N).fill(500);
  const i = 12, j = 6; // east, at the 7th distance
  const d = H.DISTANCES_M[j];
  e[1 + i * H.DISTANCES_M.length + j] = 500 + d; // as high as it is far: 45° before curvature
  const p = H.profileFromElevations(e);
  const drop = d * d * (1 - H.REFRACTION_K) / (2 * 6371000);
  close(p[i], Math.atan2(d - drop, d) * 180 / Math.PI, 0.05); // profiles are rounded to 0.1°
  assert.ok(p[i] <= 45 && p[i] > 44.5);
  assert.equal(p.filter(v => v > 0).length, 1);
});

test('curvature: a 1000 m peak 25 km away is 2.2° up, not 2.3°', () => {
  const e = new Array(N).fill(0);
  e[1 + 0 * 12 + 11] = 1000; // north, 25 km
  const p = H.profileFromElevations(e);
  close(p[0], Math.atan2(1000 - 25000 ** 2 * 0.87 / (2 * 6371000), 25000) * 180 / Math.PI, 0.05);
  assert.equal(p[0], 2.2); // 2.3° without the ~43 m the Earth's curve hides at 25 km
});

test('missing or extra elevations are refused', () => {
  assert.throws(() => H.profileFromElevations([1, 2, 3]), /expected 577/);
  const e = new Array(N).fill(0); e[5] = null;
  assert.throws(() => H.profileFromElevations(e), /expected 577/);
});

// ─── The shading model ───

const lisbon = M.parsePowerClimatology(require('./fixtures/nasa-power-lisbon.json'));

test('an open horizon changes nothing; a wall to the south removes the beam', () => {
  const open = M.monthlyYield(lisbon, 38.72, 35, 180).annual;
  close(M.monthlyYield(lisbon, 38.72, 35, 180, { horizon: new Array(48).fill(0) }).annual, open, 1e-9);
  const wall = new Array(48).fill(0).map((_, i) => (i * 7.5 > 90 && i * 7.5 < 270 ? 80 : 0));
  const shaded = M.monthlyYield(lisbon, 38.72, 35, 180, { horizon: wall });
  const diffuseAndGround = M.monthlyYield({ ...lisbon, ghi: lisbon.diffuse }, 38.72, 35, 180).annual;
  // With the beam gone, what is left is the diffuse sky plus ground reflection of the full GHI.
  assert.ok(shaded.annual < open * 0.6 && shaded.annual > diffuseAndGround * 0.9, `${shaded.annual}`);
});

test('a skyline to the north does not shade a south-facing array in the north', () => {
  const north = new Array(48).fill(0).map((_, i) => (i * 7.5 < 45 || i * 7.5 > 315 ? 30 : 0));
  close(M.monthlyYield(lisbon, 38.72, 35, 180, { horizon: north }).annual, M.monthlyYield(lisbon, 38.72, 35, 180).annual, 1e-9);
});

test('horizonAt interpolates and wraps round at north', () => {
  const h = new Array(48).fill(0); h[0] = 10; h[47] = 20;
  close(M.horizonAt(h, 0), 10, 1e-12);
  close(M.horizonAt(h, 356.25), 15, 1e-12);
  close(M.horizonAt(h, 3.75), 5, 1e-12);
  close(M.horizonAt(h, -3.75), 15, 1e-12);
});

// ─── Against PVGIS: the shading physics with PVGIS's own horizon as input ───

test('yield loss from a skyline matches PVGIS within ~2 points at five mountain sites', () => {
  const { sites } = require('./fixtures/horizon-physics-pvgis.json');
  const gaps = sites.map(s => {
    const clim = M.parsePowerClimatology(s.climatology);
    const open = M.monthlyYield(clim, s.lat, 35, 180).annual;
    const shaded = M.monthlyYield(clim, s.lat, 35, 180, { horizon: s.pvgisHorizon }).annual;
    const ours = (shaded / open - 1) * 100, pvgis = (s.pvgisShaded / s.pvgisOpen - 1) * 100;
    assert.ok(Math.abs(ours - pvgis) < 4, `${s.name}: ${ours.toFixed(1)}% vs PVGIS ${pvgis.toFixed(1)}%`);
    return Math.abs(ours - pvgis);
  });
  const mean = gaps.reduce((a, b) => a + b) / gaps.length;
  assert.ok(mean < 2, `mean gap ${mean.toFixed(2)} points`); // 1.7 when written
});

test('skyline from recorded Copernicus DEM heights at Zermatt is within ~2° of PVGIS', () => {
  const f = require('./fixtures/horizon-zermatt.json');
  const ours = H.profileFromElevations(f.elevations);
  const rmse = Math.sqrt(ours.reduce((s, v, i) => s + (v - f.pvgis[i]) ** 2, 0) / ours.length);
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  assert.ok(rmse < 2.5, `RMSE ${rmse.toFixed(2)}°`); // 2.03° when recorded
  assert.ok(Math.abs(mean(ours) - mean(f.pvgis)) < 1, `${mean(ours)} vs ${mean(f.pvgis)}`);
  assert.ok(Math.max(...ours) > 30); // the Matterhorn side
});
