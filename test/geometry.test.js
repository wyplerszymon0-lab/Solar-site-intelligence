const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { runInNewContext } = require('node:vm');
const { circularMeanDeg, detectOutliers, detectShading } = require('../geometry.js');

test('circular mean handles bearings across north', () => {
  const mean = circularMeanDeg([350, 10]);
  assert.notEqual(mean, null);
  assert.ok(Math.min(mean, 360 - mean) < 1e-9, 'expected north, got ' + mean + '°');
});

test('opposite bearings have no circular mean', () => {
  assert.equal(circularMeanDeg([90, 270]), null);
});

test('shading detection uses the sun side in both hemispheres', () => {
  const northSite = { lat: 52, lon: 20, elevation: 100 };
  const northSunSideNeighbor = { lat: 51.9999, lon: 20, elevation: 105 };
  assert.deepEqual(
    detectShading([northSite, northSunSideNeighbor], northSite.lat),
    [true, false],
  );

  const southSite = { lat: -33, lon: 151, elevation: 100 };
  const southSunSideNeighbor = { lat: -32.9999, lon: 151, elevation: 105 };
  assert.deepEqual(
    detectShading([southSite, southSunSideNeighbor], southSite.lat),
    [true, false],
  );
});

test('shading detection ignores neighbors on the shade side in both hemispheres', () => {
  const northSite = { lat: 52, lon: 20, elevation: 100 };
  const northShadeSideNeighbor = { lat: 52.0001, lon: 20, elevation: 105 };
  assert.deepEqual(
    detectShading([northSite, northShadeSideNeighbor], northSite.lat),
    [false, false],
  );

  const southSite = { lat: -33, lon: 151, elevation: 100 };
  const southShadeSideNeighbor = { lat: -33.0001, lon: 151, elevation: 105 };
  assert.deepEqual(
    detectShading([southSite, southShadeSideNeighbor], southSite.lat),
    [false, false],
  );
});

test('a flat site has no elevation outliers', () => {
  const points = [100, 100, 100, 100].map((elevation) => ({ elevation }));
  assert.deepEqual(detectOutliers(points), [false, false, false, false]);
});

test('geometry helpers are exposed to the browser app', () => {
  const context = { window: {} };
  runInNewContext(readFileSync(require.resolve('../geometry.js'), 'utf8'), context);
  assert.equal(typeof context.window.SolarGeometry.circularMeanDeg, 'function');
  assert.equal(typeof context.window.SolarGeometry.detectShading, 'function');
  assert.equal(typeof context.window.SolarGeometry.detectOutliers, 'function');
});
