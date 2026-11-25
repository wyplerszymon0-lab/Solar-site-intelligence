// Run with: node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../capacity.js');

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, msg ?? `${a} vs ${b}`);

test('winter-solstice noon elevation is 90° − (|latitude| + 23.45°) on both hemispheres', () => {
  close(C.winterNoonElevation(52.23), 14.32, 1e-9);
  close(C.winterNoonElevation(-33.87), C.winterNoonElevation(33.87), 1e-12);
  close(C.winterNoonElevation(0), 66.55, 1e-9);
});

test('GCR is the row height over the pitch of the no-shading spacing rule', () => {
  // On flat ground: pitch = h (cos β + sin β / tan α), for any row height h.
  for (const [lat, tilt] of [[52.23, 39], [38.72, 35], [-26.2, 24], [60, 50]]) {
    const alpha = C.winterNoonElevation(lat) * Math.PI / 180, beta = tilt * Math.PI / 180;
    for (const h of [1.7, 4.5]) {
      const pitch = h * (Math.cos(beta) + Math.sin(beta) / Math.tan(alpha));
      close(C.groundCoverageRatio(lat, tilt), h / pitch, 1e-12);
    }
  }
  close(C.groundCoverageRatio(52.23, 39), 0.308, 0.001); // the issue's example: Warsaw, 39°
});

test('flat rows cover the ground; steeper rows and higher latitudes need more space', () => {
  assert.equal(C.groundCoverageRatio(52.23, 0), 1);
  assert.ok(C.groundCoverageRatio(52.23, 20) > C.groundCoverageRatio(52.23, 40));
  assert.ok(C.groundCoverageRatio(38.72, 35) > C.groundCoverageRatio(52.23, 35));
  // Polar: the winter noon sun is at or below 3°, so no spacing makes sense.
  assert.equal(C.groundCoverageRatio(64, 30), null);
  assert.equal(C.groundCoverageRatio(-70, 30), null);
  assert.ok(C.groundCoverageRatio(63, 30) > 0); // 3.55° still gives a (sparse) layout
  assert.throws(() => C.groundCoverageRatio(52, -5), /tilt/);
  assert.throws(() => C.groundCoverageRatio(NaN, 30), /tilt/);
});

test('the pitch on sloping ground is the smallest one pvlib finds unshaded', () => {
  // pvlib's shaded_fraction1d with a cross-axis slope, by bisection (make-row-pitch-pvlib.py).
  const F = require('./fixtures/row-pitch-pvlib.json');
  assert.equal(F.cases.length, 24);
  for (const c of F.cases) close(C.rowPitchFactor(c.lat, c.tilt, c.grade), c.pitch, 2e-6, JSON.stringify(c));
});

test('the grade scales the GCR by 1 + grade / tan(sun elevation)', () => {
  const flat = C.groundCoverageRatio(52.23, 39), tan = Math.tan(14.32 * Math.PI / 180);
  for (const g of [-0.05, 0.05, 0.1]) close(C.groundCoverageRatio(52.23, 39, g) / flat, 1 + g / tan, 1e-12);
  close(C.groundCoverageRatio(52.23, 39, 0.05), 0.369, 0.001);
  close(C.groundCoverageRatio(52.23, 39, -0.05), 0.248, 0.001);
});

test('limits on sloping ground: GCR at most 1, no rows where the slope hides the winter sun', () => {
  assert.equal(C.groundCoverageRatio(38.72, 20, 0.5), 1); // ground steeper than the panels
  assert.equal(C.groundCoverageRatio(52.23, 39, -0.25), null); // tan 14.32° = 0.255
  assert.ok(C.groundCoverageRatio(52.23, 39, -0.2) > 0); // within 3°: sparse but possible
  assert.equal(C.groundCoverageRatio(64, 30, 0.2), null); // polar stays polar
  // Steep panels near the equator gave a GCR above 1 on flat ground, which siteCapacity refuses.
  assert.equal(C.groundCoverageRatio(0, 60), 1);
  assert.throws(() => C.groundCoverageRatio(52, 30, NaN), /grade/);
});

test('the grade is positive on an equator-facing slope on both hemispheres', () => {
  close(C.gradeAwayFromEquator(52, 5), 0.05, 1e-12);   // rising north = facing south
  close(C.gradeAwayFromEquator(-34, 5), -0.05, 1e-12); // rising north = facing south, away from the sun
});

test('capacity scales with area, usable share, GCR and module efficiency', () => {
  // 10 ha × 100% × GCR 0.4 × 21% = 40 000 m² of modules × 0.21 kW/m² = 8400 kWp.
  const c = C.siteCapacity({ areaM2: 100000, gcr: 0.4, moduleEfficiency: 0.21 });
  close(c.kWp, 8400, 1e-9);
  close(c.moduleAreaM2, 40000, 1e-9);
  close(c.haPerMWp, 10 / 8.4, 1e-12);
  close(C.siteCapacity({ areaM2: 100000, gcr: 0.4, moduleEfficiency: 0.21, usableShare: 0.75 }).kWp, 6300, 1e-9);
  close(C.siteCapacity({ areaM2: 200000, gcr: 0.4, moduleEfficiency: 0.21 }).kWp, 16800, 1e-9);
  // Defaults: 21% and the whole area.
  close(C.siteCapacity({ areaM2: 100000, gcr: 0.4 }).kWp, 8400, 1e-9);
  assert.equal(C.siteCapacity({ areaM2: 0, gcr: 0.4 }).haPerMWp, null);
});

test('Warsaw at 39°: about 1.5 ha per MWp with 21% modules on the gross area', () => {
  const c = C.siteCapacity({ areaM2: 100000, gcr: C.groundCoverageRatio(52.23, 39) });
  close(c.haPerMWp, 1000 / (0.308 * 0.21) / 10000, 0.01); // 1 MW = 1000 kW needs 1000 / (GCR × 0.21 kW/m²) m²
  assert.ok(c.haPerMWp > 1.4 && c.haPerMWp < 1.7, `${c.haPerMWp}`);
});

test('invalid capacity inputs are refused', () => {
  assert.throws(() => C.siteCapacity({ areaM2: -1, gcr: 0.4 }), /area/);
  assert.throws(() => C.siteCapacity({ areaM2: 1, gcr: 0 }), /GCR/);
  assert.throws(() => C.siteCapacity({ areaM2: 1, gcr: 1.2 }), /GCR/);
  assert.throws(() => C.siteCapacity({ areaM2: 1, gcr: 0.4, moduleEfficiency: 21 }), /efficiency/);
  assert.throws(() => C.siteCapacity({ areaM2: 1, gcr: 0.4, usableShare: 0 }), /usable/);
});

test('settings in percent: decimal commas, clamping and defaults', () => {
  assert.equal(C.moduleEfficiencyFraction('22,5'), 0.225);
  assert.equal(C.moduleEfficiencyFraction(60), 0.3);
  assert.equal(C.moduleEfficiencyFraction(''), C.DEFAULTS.moduleEfficiency);
  assert.equal(C.usableShareFraction('80'), 0.8);
  assert.equal(C.usableShareFraction(150), 1);
  assert.equal(C.usableShareFraction(2), 0.1);
  assert.equal(C.usableShareFraction('abc'), 1);
});

// ─── Tracker settings (issue #53) ───

test('tracker GCR: a ratio, default 0.33, clamped to 0.1–0.9', () => {
  assert.equal(C.DEFAULTS.trackerGcr, 0.33);
  assert.equal(C.trackerGcrSetting('0,4'), 0.4);
  assert.equal(C.trackerGcrSetting(0.05), 0.1);
  assert.equal(C.trackerGcrSetting('2'), 0.9);
  assert.equal(C.trackerGcrSetting(''), 0.33);
  assert.equal(C.trackerGcrSetting(undefined), 0.33);
});

test('tracker rotation limit: blank is none, otherwise clamped to 0–90°', () => {
  assert.equal(C.trackerLimitSetting(''), null);
  assert.equal(C.trackerLimitSetting(null), null);
  assert.equal(C.trackerLimitSetting('abc'), null);
  assert.equal(C.trackerLimitSetting('60'), 60);
  assert.equal(C.trackerLimitSetting(-5), 0);
  assert.equal(C.trackerLimitSetting(120), 90);
});

test('a tracker layout at GCR 0.33 with 21% modules: 0.69 MWp per hectare', () => {
  const c = C.siteCapacity({ areaM2: 10000, gcr: C.DEFAULTS.trackerGcr });
  assert.ok(Math.abs(c.kWp - 693) < 1e-9);
  assert.ok(Math.abs(c.haPerMWp - 1.443) < 0.001);
});
