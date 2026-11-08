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

// ─── Sky models (issue #35) ───

// Madrid and Johannesburg were in the README's PVGIS table but had no fixture; PVGIS
// PVcalc 5.3 (SARAH3) at these coordinates gives the same values, retrieved 2026-11-07.
// Their NASA fixtures are the 2001–2025 climatology, the others 2001–2020.
const PVGIS_ALL = [
  ...PVGIS,
  { name: 'madrid', lat: 40.42, tilt: 36, az: 180, kwh: 1619.51 },
  { name: 'johannesburg', lat: -26.2, tilt: 24, az: 0, kwh: 1728.49 },
];
const ALL_CASES = [
  ...PVGIS_ALL.map(r => ({ ...r, optimal: true })),
  ...PVGIS_OFF_OPTIMAL.map(r => ({ ...r, name: 'lisbon', lat: 38.72, optimal: false })),
];
const errors = (skyModel, cases = ALL_CASES) =>
  cases.map(r => M.monthlyYield(clim(r.name), r.lat, r.tilt, r.az, { skyModel }).annual / r.kwh - 1);
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

test('extraterrestrial irradiation matches Duffie & Beckman and is 0 in polar night', () => {
  // Example 1.10.1: 43° N on 15 April, H0 = 33.8 MJ/m².
  assert.ok(Math.abs(M.extraterrestrialDaily(43, 105) * 3.6 - 33.8) < 0.1);
  assert.equal(M.extraterrestrialDaily(80, 355), 0);
  assert.ok(M.extraterrestrialDaily(-80, 355) > 0); // polar day in the south
  // Same sun height six months apart on the other hemisphere (orbit distance aside).
  const n = M.extraterrestrialDaily(35, 17), s = M.extraterrestrialDaily(-35, 198);
  assert.ok(Math.abs(n / s - 1) < 0.08, `${n} vs ${s}`);
});

test('Hay–Davies equals isotropic under a fully overcast sky and on a flat panel', () => {
  const c = clim('warsaw');
  const overcast = { ...c, ghi: c.diffuse }; // no beam: anisotropy index A = 0
  for (const [tilt, az] of [[47, 180], [35, 90], [15, 0]]) {
    const iso = M.monthlyYield(overcast, 52.23, tilt, az, { skyModel: 'isotropic' }).annual;
    const hd = M.monthlyYield(overcast, 52.23, tilt, az, { skyModel: 'hay-davies' }).annual;
    assert.ok(Math.abs(hd - iso) < 1e-9, `${tilt}/${az}: ${hd} vs ${iso}`);
  }
  // Flat: circumsolar light arrives like beam, and R_b for a flat panel is 1, so only
  // glass reflection can differ, and only slightly.
  const flatIso = M.monthlyYield(c, 52.23, 0, 180, { skyModel: 'isotropic', iamB0: 0 }).annual;
  const flatHd = M.monthlyYield(c, 52.23, 0, 180, { skyModel: 'hay-davies', iamB0: 0 }).annual;
  assert.ok(Math.abs(flatHd - flatIso) < 1e-9, `${flatHd} vs ${flatIso}`);
});

test('Hay–Davies is the default, and an unknown sky model is refused', () => {
  assert.equal(M.DEFAULTS.skyModel, 'hay-davies');
  assert.deepEqual(M.SKY_MODELS, ['isotropic', 'hay-davies']);
  assert.throws(() => M.monthlyYield(clim('lisbon'), 38.72, 35, 180, { skyModel: 'perez' }), /unknown sky model/);
});

test('both sky models stay within 7% of PVGIS on all eleven cases', () => {
  // Largest when written: isotropic −6.8% (Warsaw), Hay–Davies +6.1% (Oslo, where
  // NASA's horizontal irradiation is 2.5% above PVGIS's) and +6.0% (Lisbon east).
  for (const skyModel of M.SKY_MODELS) {
    errors(skyModel).forEach((e, i) => {
      const r = ALL_CASES[i];
      assert.ok(Math.abs(e) < 0.07, `${skyModel} ${r.name} ${r.tilt}/${r.az}: ${(e * 100).toFixed(1)}%`);
    });
  }
});

test('Hay–Davies removes the low bias for equator-facing arrays and lowers the mean error', () => {
  const optimal = ALL_CASES.filter(r => r.optimal);
  const bias = (s) => mean(errors(s, optimal));
  const mae = (s) => mean(errors(s).map(Math.abs));
  // When written: bias −3.8% → −0.2%, mean absolute error over 11 cases 3.6% → 2.8%.
  assert.ok(bias('isotropic') < -0.03, `isotropic bias ${bias('isotropic')}`);
  assert.ok(Math.abs(bias('hay-davies')) < 0.01, `Hay–Davies bias ${bias('hay-davies')}`);
  assert.ok(mae('hay-davies') < mae('isotropic') - 0.005, `${mae('hay-davies')} vs ${mae('isotropic')}`);
});

test('Hay–Davies moves the optimal tilt up to PVGIS\'s (Warsaw: 39°)', () => {
  const peak = (skyModel) => {
    const curve = M.tiltCurve(clim('warsaw'), 52.23, 180, 75, { skyModel });
    return curve.indexOf(Math.max(...curve));
  };
  assert.equal(peak('isotropic'), 36);
  assert.equal(peak('hay-davies'), 39);
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

// ─── Year-to-year variability (NASA POWER monthly, Warsaw 2001–2025) ───

const warsawYears = () => M.parsePowerMonthly(require('./fixtures/nasa-power-monthly-warsaw.json'));

test('monthly series parses into one climatology-shaped entry per complete year', () => {
  const series = warsawYears();
  assert.deepEqual([series.length, series[0].year, series.at(-1).year], [25, 2001, 2025]);
  assert.equal(series[0].ghi.length, 12);
  assert.ok(series.every(y => y.ghi.every(v => v > 0) && y.temp.length === 12));
});

test('years with a missing month are left out, too few years is an error', () => {
  const json = structuredClone(require('./fixtures/nasa-power-monthly-warsaw.json'));
  json.properties.parameter.ALLSKY_SFC_SW_DIFF['202507'] = -999; // not yet published
  delete json.properties.parameter.T2M['200302'];
  const years = M.parsePowerMonthly(json).map(y => y.year);
  assert.equal(years.length, 23);
  assert.ok(!years.includes(2025) && !years.includes(2003));

  const p = json.properties.parameter;
  for (const name of Object.keys(p)) {
    for (const k of Object.keys(p[name])) if (k >= '200601') delete p[name][k];
  }
  assert.throws(() => M.parsePowerMonthly(json), /4 complete years.*at least 10/);
});

test('the yearly runs average to the climatology over the same years', () => {
  // Same model, same 2001–2020 period: the mean of the yearly yields matches the
  // climatology's yield to within 0.1 %, so both requests describe the same data.
  const series = warsawYears().filter(y => y.year <= 2020);
  const mean = M.yearlyYields(series, 52.2297, 35, 180).reduce((s, y) => s + y.annual, 0) / series.length;
  const fromClimatology = M.monthlyYield(clim('warsaw'), 52.2297, 35, 180).annual;
  assert.ok(Math.abs(mean / fromClimatology - 1) < 0.001, `${mean} vs ${fromClimatology}`);
});

// Issue #37. Since late 2026 the climatology API's header says "25-year … (January 2001 -
// December 2025)", but the numbers are unchanged: they are the 2001–2020 means. Shown
// with the API's own month-by-month data at two sites. test/fixtures/check-power-period.js
// repeats the comparison against the live API.
test('the climatology labelled 2001–2025 is still the 2001–2020 mean', () => {
  for (const site of ['warsaw', 'lisbon']) {
    const response = require(`./fixtures/nasa-power-${site}-v2.10.1.json`);
    assert.match(response.header.range, /January 2001 - December 2025/);
    const labelled = M.parsePowerClimatology(response);
    assert.deepEqual(labelled, clim(site), `${site}: the same values as the 2001–2020 climatology`);

    const years = M.parsePowerMonthly(require(`./fixtures/nasa-power-monthly-${site}.json`));
    const gap = (last, key) => Math.max(...labelled[key].map((v, m) => {
      const kept = years.filter(y => y.year <= last);
      return Math.abs(kept.reduce((s, y) => s + y[key][m], 0) / kept.length - v);
    }));
    // Means of 2001–2020 match to the rounding of the published values;
    // 2001–2025 would differ by several hundredths, and by tenths of a degree.
    assert.ok(gap(2020, 'ghi') < 0.001 && gap(2020, 'diffuse') < 0.001 && gap(2020, 'temp') < 0.01, site);
    assert.ok(gap(2025, 'ghi') > 0.04 && gap(2025, 'temp') > 0.2, site);
  }
});

test('exceedance: P50 is the mean, P90 is 1.2816 sample sigma below it', () => {
  const e = M.exceedance([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(e.p50, 5.5);
  assert.ok(Math.abs(e.sd - 3.02765) < 1e-5);           // n − 1 in the denominator
  assert.ok(Math.abs(e.p90 - (5.5 - 1.2816 * e.sd)) < 1e-12);
  assert.ok(Math.abs(e.p90Empirical - 1.9) < 1e-12);    // between the 1st and 2nd value
  assert.deepEqual([e.n, e.min, e.max], [10, 1, 10]);
  assert.throws(() => M.exceedance([5]), /two years/);
});

test('Warsaw: about 4 % year-to-year variation, P90 about 5 % below P50', () => {
  const e = M.exceedance(M.yearlyYields(warsawYears(), 52.2297, 35, 180).map(y => y.annual));
  assert.ok(e.cov > 0.03 && e.cov < 0.06, `cov ${e.cov}`);
  assert.ok(e.p90 / e.p50 > 0.92 && e.p90 / e.p50 < 0.96, `ratio ${e.p90 / e.p50}`);
  assert.ok(Math.abs(e.p90Empirical - e.p90) / e.p50 < 0.02); // the normal assumption holds here
});

test('monthly URL asks for whole years from 2001', () => {
  const url = M.powerMonthlyUrl(52.22971, 21.01219, 2025);
  assert.match(url, /temporal\/monthly\/point\?parameters=ALLSKY_SFC_SW_DWN,ALLSKY_SFC_SW_DIFF,T2M/);
  assert.match(url, /latitude=52\.2297&longitude=21\.0122&start=2001&end=2025/);
});
