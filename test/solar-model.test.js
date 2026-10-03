// Run with: node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../solar-model.js');

const clim = (name) => M.parsePowerClimatology(require(`./fixtures/nasa-power-${name}.json`));

// PVGIS 5.3 (PVGIS-SARAH3 / ERA5) annual yield, kWh/kWp, 14% system loss,
// equator-facing at tilt ≈ 0.9 × |latitude|. Retrieved 2026-09-26.
const PVGIS = [
  { name: 'lisbon', lat: 38.72, tilt: 35, az: 180, kwh: 1578.69 },
  { name: 'warsaw', lat: 52.23, tilt: 47, az: 180, kwh: 1045.02 },
  { name: 'oslo', lat: 59.91, tilt: 54, az: 180, kwh: 948.39 },
  { name: 'cairo', lat: 30.04, tilt: 27, az: 180, kwh: 1818.74 },
  { name: 'sydney', lat: -33.87, tilt: 30, az: 0, kwh: 1556.69 },
];

test('a horizontal surface receives exactly the horizontal beam (R_b = 1)', () => {
  for (const n of [17, 162, 344]) assert.ok(Math.abs(M.beamTiltFactor(45, 0, 180, n) - 1) < 1e-9);
});

test('east- and west-facing surfaces are symmetric', () => {
  const east = M.beamTiltFactor(40, 30, 90, 105);
  const west = M.beamTiltFactor(40, 30, 270, 105);
  assert.ok(Math.abs(east - west) < 1e-6, `${east} vs ${west}`);
});

test('hemispheres mirror: equator-facing tilt at ±lat, six months apart', () => {
  const north = M.beamTiltFactor(35, 30, 180, 17);   // mid-January, north
  const south = M.beamTiltFactor(-35, 30, 0, 198);   // mid-July, south
  assert.ok(Math.abs(north - south) / north < 0.01, `${north} vs ${south}`);
});

test('tilting toward the equator raises winter beam gain, facing away lowers it', () => {
  assert.ok(M.beamTiltFactor(50, 40, 180, 344) > 2);
  assert.ok(M.beamTiltFactor(50, 40, 0, 344) < 0.2);
});

// Same settings, Lisbon, orientations far from optimal (PVGIS aspect converted to compass).
const PVGIS_OFF_OPTIMAL = [
  { label: 'west 35°', tilt: 35, az: 270, kwh: 1292.87 },
  { label: 'east 35°', tilt: 35, az: 90, kwh: 1251.98 },
  { label: 'north 15°', tilt: 15, az: 0, kwh: 1153.9 },
  { label: 'flat', tilt: 0, az: 180, kwh: 1371.69 },
];

const within = (actual, expected, tolerance, label) => {
  const err = (actual - expected) / expected;
  assert.ok(Math.abs(err) < tolerance, `${label}: model ${actual.toFixed(0)} vs PVGIS ${expected} (${(err * 100).toFixed(1)}%)`);
};

test('annual yield is within 7% of PVGIS for five climates on both hemispheres', () => {
  for (const r of PVGIS) within(M.monthlyYield(clim(r.name), r.lat, r.tilt, r.az).annual, r.kwh, 0.07, r.name);
});

test('annual yield is within 6% of PVGIS for off-optimal orientations', () => {
  for (const r of PVGIS_OFF_OPTIMAL) {
    within(M.monthlyYield(clim('lisbon'), 38.72, r.tilt, r.az).annual, r.kwh, 0.06, `Lisbon ${r.label}`);
  }
});

test('glass reflection losses cost more for steep incidence than for optimal orientation', () => {
  const loss = (tilt, az) => {
    const on = M.monthlyYield(clim('lisbon'), 38.72, tilt, az).annual;
    const off = M.monthlyYield(clim('lisbon'), 38.72, tilt, az, { iamB0: 0 }).annual;
    return 1 - on / off;
  };
  assert.ok(loss(35, 180) > 0.02 && loss(35, 180) < 0.05, `optimal loss ${loss(35, 180)}`);
  assert.ok(loss(15, 0) > loss(35, 180), 'north-facing should lose more than equator-facing');
});

test('monthly yields sum to the annual total and peak in local summer', () => {
  const north = M.monthlyYield(clim('warsaw'), 52.23, 47, 180);
  const south = M.monthlyYield(clim('sydney'), -33.87, 30, 0);
  assert.ok(Math.abs(north.monthly.reduce((a, b) => a + b) - north.annual) < 1e-9);
  const peak = (m) => m.indexOf(Math.max(...m));
  assert.ok([4, 5, 6, 7].includes(peak(north.monthly)), 'Warsaw should peak May–Aug');
  assert.ok([0, 1, 9, 10, 11].includes(peak(south.monthly)), 'Sydney should peak Oct–Feb');
});

test('parsePowerClimatology rejects fill values', () => {
  const bad = { properties: { parameter: { ALLSKY_SFC_SW_DWN: { JAN: -999 }, ALLSKY_SFC_SW_DIFF: {}, T2M: {} } } };
  assert.throws(() => M.parsePowerClimatology(bad), /incomplete/);
});

test('tilt curve peaks at the optimum and matches monthlyYield point by point', () => {
  const c = clim('warsaw');
  const curve = M.tiltCurve(c, 52.23, 180, 60);
  assert.equal(curve.length, 61);
  const best = curve.indexOf(Math.max(...curve));
  assert.ok(best > 25 && best < 50, `optimum at ${best}°`);
  // Rises to the optimum and falls after it: a single peak.
  for (let i = 1; i <= best; i++) assert.ok(curve[i] >= curve[i - 1] - 1e-9, `not rising at ${i}°`);
  for (let i = best + 1; i < curve.length; i++) assert.ok(curve[i] <= curve[i - 1] + 1e-9, `not falling at ${i}°`);
  assert.ok(Math.abs(curve[20] - M.monthlyYield(c, 52.23, 20, 180).annual) < 1e-9);
});

test('yield scales with (1 - system losses); the default matches PVGIS input', () => {
  const c = clim('lisbon');
  const at = (systemLoss) => M.monthlyYield(c, 38.72, 35, 180, { systemLoss }).annual;
  assert.equal(M.DEFAULTS.systemLoss, 0.14);
  assert.ok(Math.abs(at(0.08) / at(0.20) - 0.92 / 0.80) < 1e-12);
  assert.equal(M.monthlyYield(c, 38.72, 35, 180).annual, at(0.14));
  // Optimal tilt does not depend on losses (they scale every tilt equally).
  const peak = (curve) => curve.indexOf(Math.max(...curve));
  assert.equal(peak(M.tiltCurve(c, 38.72, 180, 75, { systemLoss: 0.08 })), peak(M.tiltCurve(c, 38.72, 180)));
});

test('systemLossFraction parses user input in percent', () => {
  assert.equal(M.systemLossFraction('14'), 0.14);
  assert.equal(M.systemLossFraction(9.5), 0.095);
  assert.equal(M.systemLossFraction('12,5'), 0.125);   // decimal comma
  assert.equal(M.systemLossFraction('0'), 0);
  assert.equal(M.systemLossFraction('-3'), 0);        // clamped
  assert.equal(M.systemLossFraction('95'), M.SYSTEM_LOSS_MAX_PCT / 100);
  for (const bad of ['', 'abc', null, undefined, NaN]) {
    assert.equal(M.systemLossFraction(bad), M.DEFAULTS.systemLoss, String(bad));
  }
});

test('cached climatology is fresh for 180 days, then refetched', () => {
  const now = Date.parse('2026-10-03T12:00:00Z');
  const daysAgo = (d) => ({ ghi: [], fetchedAt: new Date(now - d * 86400000).toISOString() });
  assert.equal(M.CLIMATOLOGY_MAX_AGE_DAYS, 180);
  assert.equal(M.climatologyIsFresh(daysAgo(0), now), true);
  assert.equal(M.climatologyIsFresh(daysAgo(179.9), now), true);
  assert.equal(M.climatologyIsFresh(daysAgo(180), now), false);
  assert.equal(M.climatologyIsFresh(daysAgo(400), now), false);
});

test('entries without a usable timestamp count as stale', () => {
  const now = Date.parse('2026-10-03T12:00:00Z');
  assert.equal(M.climatologyIsFresh({ ghi: [] }, now), false);               // cached before timestamps
  assert.equal(M.climatologyIsFresh({ fetchedAt: 'yesterday' }, now), false);
  assert.equal(M.climatologyIsFresh({ fetchedAt: '2026-10-05T00:00:00Z' }, now), false); // clock ahead
  for (const v of [undefined, null, 'loading', 'error']) assert.equal(M.climatologyIsFresh(v, now), false);
});
