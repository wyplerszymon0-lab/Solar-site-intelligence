// Run with: node --test
// Hourly data against the mean day, same year as PVGIS (issue #57).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const M = require('../solar-model.js');

const F = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname, 'fixtures', 'hourly-2020.json.gz'))));
const hoursOf = (s) => ({
  startMs: Date.parse(s.nasa.start), ghi: s.nasa.ghi, diffuse: s.nasa.diffuse, dni: s.nasa.dni,
  temp: s.nasa.t2m.map(v => (v == null ? null : v / 10)),
});
const monthly2020 = (name) => M.parsePowerMonthly(require(`./fixtures/nasa-power-monthly-${name}.json`)).find(y => y.year === 2020);
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const DEG = Math.PI / 180;

test('sun position: highest at solar noon, at the right height, and symmetric about it', () => {
  // Lisbon, 2020-03-20 (equinox): noon elevation ≈ 90° − latitude; solar noon near 12:44 UTC.
  const lat = 38.72, lon = -9.14, day = Date.UTC(2020, 2, 20);
  let best = { up: -2, min: 0 };
  for (let m = 0; m < 1440; m++) {
    const up = M.sunPosition(lat, lon, day + m * 60000).up;
    if (up > best.up) best = { up, min: m };
  }
  assert.ok(Math.abs(Math.asin(best.up) / DEG - (90 - lat)) < 0.5, `${Math.asin(best.up) / DEG}`);
  assert.ok(Math.abs(best.min - (12 * 60 + 44)) < 4, `noon at ${best.min} min`);
  const before = M.sunPosition(lat, lon, day + (best.min - 180) * 60000), after = M.sunPosition(lat, lon, day + (best.min + 180) * 60000);
  assert.ok(Math.abs(before.up - after.up) < 0.01 && before.east > 0 && after.east < 0);
});

test('NASA hourly values belong to the hour starting at the stamp: GHI centres about 30 min later', () => {
  // NASA's documentation does not say. Measured: with each value placed at HH:00 UTC, the
  // day's GHI centroid falls 26–32 min before solar noon at all seven sites, i.e. at HH:30.
  for (const s of F.sites) {
    const h = hoursOf(s), offsets = [];
    for (let d = 1; d < 365; d++) {
      let best = { up: -2, ms: 0 };
      for (let m = 0; m < 1440; m += 4) {
        const ms = h.startMs + d * 86400000 + m * 60000;
        const up = M.sunPosition(s.lat, s.lon, ms).up;
        if (up > best.up) best = { up, ms };
      }
      let sum = 0, moment = 0; // over the 24 hours around that noon, values at their stamp
      for (let i = 0; i < h.ghi.length; i++) {
        const t = h.startMs + i * 3600000 - best.ms;
        if (Math.abs(t) > 12 * 3600000 || !(h.ghi[i] > 0)) continue;
        sum += h.ghi[i]; moment += h.ghi[i] * t;
      }
      if (sum > 0) offsets.push(moment / sum / 60000);
    }
    offsets.sort((a, b) => a - b);
    const median = offsets[offsets.length >> 1];
    assert.ok(median < -20 && median > -40, `${s.name}: ${median.toFixed(1)} min`);
  }
});

test('hourly NASA DNI below 5° of sun matches PVGIS, which the mean day overstates 4 times (#51)', () => {
  const D = require('./fixtures/pvgis-dni-by-elevation.json');
  for (const ds of D.sites) {
    const s = F.sites.find(x => x.name === ds.name), h = hoursOf(s);
    const bins = new Array(D.bins.length - 1).fill(0);
    h.dni.forEach((v, i) => {
      if (!(v > 0)) return;
      const up = M.sunPosition(s.lat, s.lon, h.startMs + i * 3600000 + 1800000).up;
      if (up <= 0) return;
      const e = Math.asin(up) / DEG;
      bins[D.bins.findIndex((b, k) => e >= b && e < D.bins[k + 1])] += v;
    });
    const share = (xs, i) => xs[i] / xs.reduce((a, b) => a + b, 0);
    // When written: Lisbon 0.9 / 0.9 %, Warsaw 1.1 / 1.0 %, Johannesburg 1.1 / 1.2 %.
    assert.ok(Math.abs(share(bins, 0) - share(ds.dniKwh, 0)) < 0.004, ds.name);
  }
});

test('parsing NASA hourly JSON: from the first stamp, missing values as null', () => {
  const json = { properties: { parameter: {
    ALLSKY_SFC_SW_DWN: { 2020010101: 5, 2020010100: 0 }, ALLSKY_SFC_SW_DIFF: { 2020010100: 0, 2020010101: 4 },
    ALLSKY_SFC_SW_DNI: { 2020010100: 0, 2020010101: -999 }, T2M: { 2020010100: 9.5, 2020010101: 9.1 },
  } } };
  const h = M.parsePowerHourly(json);
  assert.equal(h.startMs, Date.UTC(2020, 0, 1, 0));
  assert.deepEqual([h.ghi, h.diffuse, h.dni, h.temp], [[0, 5], [0, 4], [0, null], [9.5, 9.1]]);
  assert.throws(() => M.parsePowerHourly({}), /no hourly data/);
});

test('a flat array without reflection losses receives exactly the horizontal irradiation', () => {
  // Synthetic hours where GHI = DNI·cos Z + DHI holds exactly: the flat plane gets GHI.
  const lat = 45, lon = 10, startMs = Date.UTC(2020, 5, 1);
  const hours = { startMs, ghi: [], diffuse: [], dni: [], temp: [] };
  for (let i = 0; i < 48; i++) {
    const up = M.sunPosition(lat, lon, startMs + i * 3600000 + 1800000).up;
    // Sun above 5° only: below it, Hay–Davies caps the circumsolar factor at cos Z = 0.087,
    // which on purpose gives a flat plane less than the sky's light (the usual hourly guard).
    const lit = up > 0.087, dni = lit ? 700 : 0, dhi = lit ? 100 : 0;
    hours.dni.push(dni); hours.diffuse.push(dhi); hours.ghi.push(lit ? dni * up + dhi : 0); hours.temp.push(5);
  }
  for (const skyModel of ['isotropic', 'hay-davies']) {
    const r = M.hourlyYield(hours, lat, lon, 0, 180, { iamB0: 0, skyModel });
    const ghi = hours.ghi.reduce((a, b) => a + b, 0) / 1000;
    assert.ok(Math.abs(r.poaAnnual - ghi) < 1e-9, `${skyModel}: ${r.poaAnnual} vs ${ghi}`);
  }
});

// ─── The study: hourly against the mean day, against PVGIS seriescalc 2020 ───

const MOUNTINGS = {
  equator: (s) => [s.tilt, s.lat >= 0 ? 180 : 0, {}], east: () => [35, 90, {}], west: () => [35, 270, {}],
  tracker: () => [0, 180, { mounting: 'single-axis' }],
};
const study = F.sites.flatMap(s => Object.entries(MOUNTINGS).map(([key, args]) => {
  const [tilt, az, o] = args(s);
  return {
    site: s.name, key,
    hourly: M.hourlyYield(hoursOf(s), s.lat, s.lon, tilt, az, o).annual / s.pvgis[key] - 1,
    meanDay: M.monthlyYield(monthly2020(s.name), s.lat, tilt, az, o).annual / s.pvgis[key] - 1,
  };
}));
const mae = (rows, k) => mean(rows.map(r => Math.abs(r[k])));

test('hourly data fix the tracker: its error against PVGIS drops at most sites', () => {
  // When written, tracker MAE 5.10 % hourly against 5.81 % mean day, mean −2.8 against +4.9 %.
  const tr = study.filter(r => r.key === 'tracker');
  assert.equal(tr.length, 7);
  assert.ok(mae(tr, 'hourly') < mae(tr, 'meanDay'));
  assert.ok(mean(tr.map(r => r.meanDay)) > 0.03 && mean(tr.map(r => r.hourly)) < 0);
});

test('but not fixed arrays: over all 28 cases the mean day stays slightly closer to PVGIS', () => {
  // When written: MAE 3.98 % hourly against 3.66 % mean day (RMS 4.79 against 5.13 %);
  // fixed arrays alone 3.61 against 2.94 %. This is why the app keeps the mean day (README).
  assert.equal(study.length, 28);
  assert.ok(mae(study, 'hourly') > mae(study, 'meanDay'));
  const fixed = study.filter(r => r.key !== 'tracker');
  assert.ok(mae(fixed, 'hourly') > mae(fixed, 'meanDay'));
  for (const r of study) {
    const limit = r.site === 'oslo' ? 0.16 : 0.10; // Oslo: NASA's irradiance is high there (README)
    assert.ok(Math.abs(r.hourly) < limit && Math.abs(r.meanDay) < limit, `${r.site} ${r.key}`);
  }
});
