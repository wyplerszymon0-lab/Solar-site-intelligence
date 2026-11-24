// Run with: node --test
// Terrain slope and aspect from the survey's own elevations (issue #63).
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../geometry.js');
const F = require('./fixtures/terrain-plane-pyproj.json');

const asPoints = (rows) => rows.map(([lat, lon, elevation]) => ({ lat, lon, elevation }));
const angleDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

test('local metres match pyproj\'s exact tangent plane to 2 mm on sites up to 3 km', () => {
  for (const s of F.sites) {
    s.points.forEach(([lat, lon], i) => {
      const [e, n] = G.localMetres(lat, lon, s.lat0, s.lon0);
      assert.ok(Math.hypot(e - s.en[i][0], n - s.en[i][1]) < 0.002, `${s.name} point ${i}`);
    });
  }
});

test('the plane matches numpy least squares, also across the antimeridian', () => {
  for (const s of F.sites) {
    const r = G.terrainPlane(asPoints(s.points));
    assert.equal(r.n, 49);
    assert.ok(Math.abs(r.slopeDeg - s.slopeDeg) < 1e-4, `${s.name} slope ${r.slopeDeg}`);
    assert.ok(angleDiff(r.aspectDeg, s.aspectDeg) < 1e-3, `${s.name} aspect ${r.aspectDeg}`);
    assert.ok(Math.abs(r.gradeEastPct - s.gradeEastPct) < 1e-3 && Math.abs(r.gradeNorthPct - s.gradeNorthPct) < 1e-3, s.name);
    assert.ok(Math.abs(r.rmsM - s.rmsM) < 1e-4, `${s.name} rms ${r.rmsM}`);
  }
});

test('an exact plane is recovered: slope, downhill aspect and no residual', () => {
  // Built in the function's own metres: 10 % down towards the south-east (135°).
  const lat0 = 45, lon0 = 7, pts = [];
  for (let i = -2; i <= 2; i++) {
    for (let j = -2; j <= 2; j++) {
      const lat = lat0 + i * 0.001, lon = lon0 + j * 0.0014;
      const [e, n] = G.localMetres(lat, lon, lat0, lon0);
      pts.push({ lat, lon, elevation: 500 - 0.1 * (e - n) / Math.SQRT2 });
    }
  }
  const r = G.terrainPlane(pts);
  assert.ok(Math.abs(Math.tan(r.slopeDeg * Math.PI / 180) - 0.1) < 1e-6, `${r.slopeDeg}`);
  assert.ok(angleDiff(r.aspectDeg, 135) < 0.01, `${r.aspectDeg}`);
  assert.ok(r.rmsM < 0.01);
  // A level site has no aspect.
  const level = G.terrainPlane(pts.map(p => ({ ...p, elevation: 200 })));
  assert.equal(level.slopeDeg, 0);
  assert.equal(level.aspectDeg, null);
});

test('no plane from fewer than three heights or from points along one line', () => {
  const p = (lat, lon, elevation) => ({ lat, lon, elevation });
  assert.equal(G.terrainPlane([p(50, 20, 1), p(50.001, 20, 2)]), null);
  assert.equal(G.terrainPlane([p(50, 20, 1), p(50.001, 20, 2), p(50.002, 20.001, null)]), null);
  // The demo survey is a transect: its points lie on one line in lat/lon.
  const demo = [[38.7223, -9.1393, 145], [38.7225, -9.1390, 147], [38.7227, -9.1387, 149], [38.7220, -9.1396, 143],
    [38.7229, -9.1384, 151], [38.7218, -9.1399, 141], [38.7231, -9.1381, 153], [38.7216, -9.1402, 139],
    [38.7233, -9.1378, 155], [38.7214, -9.1405, 137]];
  assert.equal(G.terrainPlane(asPoints(demo)), null);
  // A spread across the line of 4 % of the spread along it is still too narrow, 6 % is enough.
  const strip = (w) => asPoints([[50, 20, 1], [50, 20.01, 2], [50, 20.02, 3], [50 + w * 0.0129, 20.01, 2], [50 - w * 0.0129, 20.01, 2]]);
  assert.equal(G.terrainPlane(strip(0.02)), null);
  assert.ok(G.terrainPlane(strip(0.03)));
});

test('an elevation outlier shows in the residual', () => {
  const s = F.sites.find(x => x.name === 'sydney-1km');
  const pts = asPoints(s.points);
  pts[24] = { ...pts[24], elevation: pts[24].elevation + 30 };
  const r = G.terrainPlane(pts);
  assert.ok(r.rmsM > 4 * s.rmsM, `${r.rmsM}`);
});
