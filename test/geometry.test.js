// Run with: node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../geometry.js');

const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) < tol, `${a} vs ${b}`);

// Offset a point by metres (small distances, equirectangular).
const offset = (p, north, east) => ({
  ...p,
  lat: p.lat + north / 111195,
  lon: p.lon + east / (111195 * Math.cos(p.lat * Math.PI / 180)),
});

test('azimuth difference wraps around north', () => {
  assert.equal(G.azimuthDiff(350, 10), 20);
  assert.equal(G.azimuthDiff(10, 350), 20);
  assert.equal(G.azimuthDiff(0, 180), 180);
  assert.equal(G.azimuthDiff(360, 0), 0);
});

test('circular mean handles bearings across north and opposite bearings', () => {
  near(G.circularMeanDeg([350, 355, 0, 5, 10]) % 360, 0, 1e-9);
  near(G.circularMeanDeg([175, 178, 172, 180, 168]), 174.6, 0.01); // circular, not arithmetic, mean
  near(G.circularMeanDeg([359, 1]) % 360, 0, 1e-9);
  assert.equal(G.circularMeanDeg([90, 270]), null);
  assert.equal(G.circularMeanDeg([]), null);
});

test('rating prefers the equator-facing azimuth on both hemispheres', () => {
  assert.equal(G.solarRating(40, 30, 180), 'good');
  assert.equal(G.solarRating(40, 30, 0), 'bad');
  assert.equal(G.solarRating(-35, 30, 0), 'good');
  assert.equal(G.solarRating(-35, 30, 180), 'bad');
  assert.equal(G.solarRating(40, 80, 180), 'mid'); // very steep
});

test('distance and bearing', () => {
  const a = { lat: 52.23, lon: 21.01 };
  near(G.haversineM(a, offset(a, 100, 0)), 100, 0.1);
  near(G.bearingDeg(a, offset(a, 100, 0)), 0, 1e-3);
  near(G.bearingDeg(a, offset(a, 0, 100)), 90, 0.01);
  near(G.bearingDeg(a, offset(a, -100, 0)), 180, 1e-3);
});

test('shading: a taller neighbour on the sun side flags, on the shade side does not', () => {
  for (const [lat, sunSide] of [[40, -20], [-35, 20]]) { // sun is south in the north, north in the south
    const p = { lat, lon: 10, elevation: 100 };
    const sunNeighbour = { ...offset(p, sunSide, 0), elevation: 106 };
    const shadeNeighbour = { ...offset(p, -sunSide, 0), elevation: 106 };
    assert.deepEqual(G.detectShading([p, sunNeighbour], lat), [true, false], `lat ${lat}, sun side`);
    assert.deepEqual(G.detectShading([p, shadeNeighbour], lat), [false, false], `lat ${lat}, shade side`);
  }
});

test('shading ignores small height differences, far neighbours and missing elevations', () => {
  const p = { lat: 40, lon: 10, elevation: 100 };
  assert.deepEqual(G.detectShading([p, { ...offset(p, -20, 0), elevation: 102 }], 40), [false, false]);
  assert.deepEqual(G.detectShading([p, { ...offset(p, -50, 0), elevation: 120 }], 40), [false, false]);
  assert.deepEqual(G.detectShading([{ ...p, elevation: null }, { ...offset(p, -20, 0), elevation: 120 }], 40), [false, false]);
});

test('outliers: an obvious typo is caught even in a small survey', () => {
  const flags = (els) => G.detectOutliers(els.map(elevation => ({ elevation })));
  // Mean ± 2σ could never flag these: with 4–5 points no value exceeds 1.8σ.
  assert.deepEqual(flags([145, 147, 1450, 146]), [false, false, true, false]);
  assert.deepEqual(flags([145, 147, 1450, 146, 144]), [false, false, true, false, false]);
});

test('outliers: a steadily sloping site has none', () => {
  const demo = [145, 147, 149, 143, 151, 141, 153, 139, 155, 137].map(elevation => ({ elevation }));
  assert.deepEqual(G.detectOutliers(demo), demo.map(() => false));
});

test('outliers: edge cases', () => {
  const pts = (els) => els.map(elevation => ({ elevation }));
  assert.deepEqual(G.detectOutliers(pts([100, 500, 100])), [false, false, false]); // too few points
  assert.deepEqual(G.detectOutliers(pts([100, 100, 100, 100])), [false, false, false, false]);
  // Most values identical (MAD = 0): falls back to the mean absolute deviation.
  assert.deepEqual(G.detectOutliers(pts([100, 100, 100, 100, 100, 180])), [false, false, false, false, false, true]);
  assert.deepEqual(G.detectOutliers(pts([145, null, 147, 1450, 146])), [false, false, false, true, false]);
});

test('convex hull and area of a 100 m × 50 m rectangle', () => {
  const o = { lat: 38.72, lon: -9.14 };
  const corners = [o, offset(o, 50, 0), offset(o, 0, 100), offset(o, 50, 100)];
  const inside = offset(o, 25, 50);
  const hull = G.convexHull([...corners, inside]);
  assert.equal(hull.length, 4);
  near(G.polygonAreaM2(hull, o.lat), 5000, 5000 * 0.005); // within 0.5%
  assert.equal(G.polygonAreaM2(G.convexHull([o, offset(o, 10, 0)]), o.lat), 0);
});
