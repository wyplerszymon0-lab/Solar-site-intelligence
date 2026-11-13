// Run with: node --test
// Single-axis tracker: horizontal north–south axis (issue #49).
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../solar-model.js');

const PVGIS = require('./fixtures/pvgis-tracker.json').sites;
const seriesClim = (name) => M.climatologyFromSeries(
  M.parsePowerMonthly(require(`./fixtures/nasa-power-monthly-${name}.json`)));
const tracker = (clim, lat, options = {}) => M.monthlyYield(clim, lat, 0, 180, { mounting: 'single-axis', ...options });
const equatorAz = (lat) => (lat >= 0 ? 180 : 0);
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

test('a tracker held flat is a flat fixed array', () => {
  const c = seriesClim('lisbon');
  const flat = M.monthlyYield(c, 38.72, 0, 180).annual;
  assert.ok(Math.abs(tracker(c, 38.72, { trackerLimit: 0 }).annual - flat) < 1e-9);
});

test('tilt and azimuth do not matter to a tracker; an unknown mounting is refused', () => {
  const c = seriesClim('warsaw');
  assert.equal(M.monthlyYield(c, 52.23, 47, 180, { mounting: 'single-axis' }).annual,
    M.monthlyYield(c, 52.23, 10, 90, { mounting: 'single-axis' }).annual);
  assert.throws(() => M.monthlyYield(c, 52.23, 47, 180, { mounting: 'dual-axis' }), /unknown mounting/);
  assert.equal(M.DEFAULTS.mounting, 'fixed');
});

test('a tracker never catches less beam than a flat array, and sees more sky than ground', () => {
  for (const lat of [0, 30, 52, -34, 65]) {
    for (const n of [17, 80, 172, 264, 355]) {
      const day = { H: 5, Hd: 2, profile: M.DEFAULTS.beamProfile };
      const f = M.trackerDayFactors(lat, n, 0, null, day);
      if (M.extraterrestrialDaily(lat, n) === 0) continue; // polar night
      assert.ok(f.beam >= 1 - 1e-9, `lat ${lat}, day ${n}: ${f.beam}`);
      assert.ok(f.sky <= 1 && f.sky >= 0.5 && f.ground >= 0 && f.ground <= 0.5);
      assert.ok(Math.abs(f.sky + f.ground - 1) < 0.2); // tilts the same way for both, weights differ
    }
  }
});

test('a rotation limit costs yield, more the tighter it is; 90° is no limit', () => {
  const c = seriesClim('madrid');
  const y = [null, 90, 60, 45, 0].map(limit => tracker(c, 40.42, { trackerLimit: limit }).annual);
  assert.ok(Math.abs(y[0] - y[1]) < 1e-9);
  for (let i = 1; i < y.length - 1; i++) assert.ok(y[i] > y[i + 1], `${y[i]} vs ${y[i + 1]}`);
  // ±60°, the usual mechanical stop, keeps most of the gain over flat.
  assert.ok((y[2] - y[4]) / (y[0] - y[4]) > 0.8);
});

test('hemispheres mirror: the same day six months apart on the other side', () => {
  const day = { H: 6, Hd: 2, profile: M.DEFAULTS.beamProfile };
  const north = M.trackerDayFactors(35, 17, 0.05, null, day), south = M.trackerDayFactors(-35, 198, 0.05, null, day);
  assert.ok(Math.abs(north.beam / south.beam - 1) < 0.01, `${north.beam} vs ${south.beam}`);
});

test('a skyline that hides the low sun costs a tracker more than a fixed array', () => {
  const c = seriesClim('lisbon');
  const horizon = Array.from({ length: 48 }, (_, i) => ((i * 7.5) % 180 === 90 ? 15 : 10)); // 10–15° all round
  const loss = (o) => 1 - M.monthlyYield(c, 38.72, 35, 180, { ...o, horizon }).annual / M.monthlyYield(c, 38.72, 35, 180, o).annual;
  assert.ok(loss({ mounting: 'single-axis' }) > loss({}), `${loss({ mounting: 'single-axis' })} vs ${loss({})}`);
});

// ─── Against PVGIS 5.3 (inclined_axis at 0° slope = horizontal N–S axis, no rotation limit) ───

const errors = (options = {}) => PVGIS.map(s => tracker(seriesClim(s.name), s.lat, options).annual / s.tracker.E_y - 1);

test('tracker yield within 9% of PVGIS at the seven validation sites (Oslo 12%)', () => {
  // When written: Lisbon +3.1, Warsaw +0.8, Oslo +11.2, Cairo +1.4, Sydney +0.1, Madrid +2.1,
  // Johannesburg +8.7 %. Oslo is high for fixed arrays too (NASA's GHI 2.5 % above PVGIS's).
  errors().forEach((e, i) => {
    const limit = PVGIS[i].name === 'oslo' ? 0.12 : 0.09;
    assert.ok(Math.abs(e) < limit, `${PVGIS[i].name}: ${(e * 100).toFixed(1)}%`);
  });
  assert.ok(mean(errors()) > 0 && mean(errors()) < 0.05, `mean ${(mean(errors()) * 100).toFixed(2)}%`);
});

test('the tracker uncertainty is its RMS error against PVGIS at the seven sites', () => {
  const err = errors();
  const rms = Math.sqrt(mean(err.map(e => e * e)));
  assert.ok(Math.abs(rms - M.TRACKER_ESTIMATE_UNCERTAINTY) < 0.0015, `RMS ${(rms * 100).toFixed(2)}%`);
  assert.ok(M.TRACKER_ESTIMATE_UNCERTAINTY > M.ESTIMATE_UNCERTAINTY);
  const rest = err.filter((_, i) => PVGIS[i].name !== 'oslo');
  assert.ok(Math.sqrt(mean(rest.map(e => e * e))) < 0.045);
});

test('the gain over a fixed array is overrated by about 3%, and was by 14% with constant clearness', () => {
  // Gain = tracker / fixed array at the same site's validation tilt, model against PVGIS.
  // The overshoot is in the plane-of-array irradiation already, so it is the low-sun beam
  // (issue #41), not temperature or module losses.
  const overshoot = (beamProfile) => PVGIS.map(s => {
    const c = seriesClim(s.name);
    const o = { beamProfile };
    const gain = tracker(c, s.lat, o).annual / M.monthlyYield(c, s.lat, s.tilt, equatorAz(s.lat), o).annual;
    return gain / (s.tracker.E_y / s.fixed.E_y) - 1;
  });
  const shaped = overshoot('collares-pereira-rabl'), constant = overshoot('constant-clearness');
  assert.ok(mean(shaped) > 0.01 && mean(shaped) < 0.05, `shaped ${(mean(shaped) * 100).toFixed(1)}%`);
  assert.ok(mean(constant) > 0.10, `constant ${(mean(constant) * 100).toFixed(1)}%`);
  assert.ok(Math.max(...shaped) < 0.07);
});

test('the PVGIS fixture is the same fixed-array reference as the main validation', () => {
  // Fixed arrays at the validation tilts: equal to the values in solar-model.test.js
  // (Johannesburg there was recorded at aspect 179°: 1728.49).
  const fixed = Object.fromEntries(PVGIS.map(s => [s.name, s.fixed.E_y]));
  assert.deepEqual([fixed.lisbon, fixed.warsaw, fixed.oslo, fixed.cairo, fixed.sydney, fixed.madrid],
    [1578.69, 1045.02, 948.39, 1818.74, 1556.69, 1619.51]);
  assert.ok(Math.abs(fixed.johannesburg / 1728.49 - 1) < 0.002);
  for (const s of PVGIS) assert.equal(s.tracker.E_m.length, 12);
});

// ─── Where the overshoot comes from: beam at low sun (issue #51) ───

test('the model puts about 4 times PVGIS\'s share of the year\'s DNI below 5° of sun elevation', () => {
  // PVGIS seriescalc 2020, hourly, binned by sun elevation; the model's mean days, 2001–2025.
  // When written, below 5°: Lisbon 4.4 vs 0.9 %, Warsaw 4.6 vs 1.0 %, Johannesburg 4.1 vs 1.2 %.
  const F = require('./fixtures/pvgis-dni-by-elevation.json');
  const MEAN_DAY = [17, 47, 75, 105, 135, 162, 198, 228, 258, 288, 318, 344];
  const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const DEG = Math.PI / 180;
  const shares = (xs) => { const t = xs.reduce((a, b) => a + b, 0); return xs.map(v => v / t); };
  const binOf = (e) => F.bins.findIndex((b, k) => e >= b && e < F.bins[k + 1]);
  for (const s of F.sites) {
    const c = seriesClim(s.name);
    const model = new Array(F.bins.length - 1).fill(0);
    MEAN_DAY.forEach((n, m) => {
      const d = 23.45 * Math.sin(2 * Math.PI * (284 + n) / 365) * DEG;
      const day = { H: c.ghi[m], Hd: c.diffuse[m], profile: M.DEFAULTS.beamProfile };
      for (const x of M.dayMoments(s.lat * DEG, d, day)) model[binOf(Math.asin(x.cosZ) / DEG)] += x.beam / x.cosZ * DAYS[m];
    });
    const [ours, pvgis] = [shares(model), shares(s.dniKwh)];
    assert.ok(ours[0] > 3 * pvgis[0], `${s.name}: ${(ours[0] * 100).toFixed(1)} vs ${(pvgis[0] * 100).toFixed(1)}%`);
    // Above 20° the two agree to a few points: the excess is a low-sun effect.
    const above20 = (xs) => xs.slice(F.bins.indexOf(20)).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(above20(ours) - above20(pvgis)) < 0.06, `${s.name} above 20°`);
  }
});
