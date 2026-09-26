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

test('annual yield is within 5% of PVGIS for five climates on both hemispheres', () => {
  for (const r of PVGIS) {
    const y = M.monthlyYield(clim(r.name), r.lat, r.tilt, r.az).annual;
    const err = (y - r.kwh) / r.kwh;
    assert.ok(Math.abs(err) < 0.05, `${r.name}: model ${y.toFixed(0)} vs PVGIS ${r.kwh} (${(err * 100).toFixed(1)}%)`);
  }
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
