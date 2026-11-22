// Run with: node --test
// Hourly data with a module temperature from irradiance and wind, as PVGIS (issue #61).
// Answer: it helps hourly data, but fixed arrays stay closer to PVGIS on the mean day.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const M = require('../solar-model.js');

const gz = (name) => JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname, 'fixtures', name))));
const F = gz('hourly-2020.json.gz'), WIND = gz('hourly-wind-2020.json.gz');
const hoursOf = (s) => ({
  startMs: Date.parse(s.nasa.start), ghi: s.nasa.ghi, diffuse: s.nasa.diffuse, dni: s.nasa.dni,
  temp: s.nasa.t2m.map(v => (v == null ? null : v / 10)),
  wind: WIND.sites.find(w => w.name === s.name).ws10m.map(v => (v == null ? null : v / 10)),
});
const monthly2020 = (name) => M.parsePowerMonthly(require(`./fixtures/nasa-power-monthly-${name}.json`)).find(y => y.year === 2020);
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const mae = (xs) => mean(xs.map(Math.abs));

// pvlib 0.16.1: temperature.faiman(G, Ta, W, u0=26.9, u1=6.2) and
// pvarray.huld(G, Tm, 1, cell_type='csi', k_version='pvgis5') = G/1000 · relative efficiency.
const PVLIB = [
  [1000, 25, 1, 55.2115, 0.862509], [800, 30, 3.5, 46.4609, 0.722155], [300, 10, 0.5, 20.0, 0.295619],
  [50, 5, 6, 5.78, 0.037998], [600, 35, 0, 57.3048, 0.510325],
];

// One synthetic hour of diffuse light only on a flat plate without reflection losses, so the
// plane receives exactly G and the yield shows the module model alone.
const oneHour = (G, T, W) => ({ startMs: Date.UTC(2020, 5, 21, 11), ghi: [G], diffuse: [G], dni: [0], temp: [T], wind: [W] });
const flat = { iamB0: 0, systemLoss: 0, skyModel: 'isotropic' };

test('the Faiman module temperature and the Huld efficiency match pvlib', () => {
  for (const [G, T, W, Tm, huld] of PVLIB) {
    const linear = M.hourlyYield(oneHour(G, T, W), 45, 0, 0, 180, { ...flat, moduleTemp: 'faiman' }).annual;
    assert.ok(Math.abs(linear - G / 1000 * (1 - 0.004 * (Tm - 25))) < 1e-6, `Faiman at ${G} W/m²`);
    const withHuld = M.hourlyYield(oneHour(G, T, W), 45, 0, 0, 180, { ...flat, moduleTemp: 'faiman', power: 'huld' }).annual;
    assert.ok(Math.abs(withHuld - huld) < 1e-5, `Huld at ${G} W/m²: ${withHuld} against ${huld}`);
    assert.ok(Math.abs(M.huldEfficiency(G, Tm) * G / 1000 - huld) < 1e-5);
  }
});

test('the module options are checked', () => {
  const h = oneHour(500, 20, 2);
  assert.throws(() => M.hourlyYield({ ...h, wind: undefined }, 45, 0, 0, 180, { moduleTemp: 'faiman' }), /needs hours.wind/);
  assert.throws(() => M.hourlyYield(h, 45, 0, 0, 180, { moduleTemp: 'noct' }), /unknown module temperature/);
  assert.throws(() => M.hourlyYield(h, 45, 0, 0, 180, { power: 'sandia' }), /unknown power model/);
  // The defaults are unchanged: T + 20 °C and −0.4 %/°C, without wind.
  const r = M.hourlyYield({ ...h, wind: undefined }, 45, 0, 0, 180, flat).annual;
  assert.ok(Math.abs(r - 0.5 * (1 - 0.004 * 15)) < 1e-9);
});

const MOUNTINGS = {
  equator: (s) => [s.tilt, s.lat >= 0 ? 180 : 0, {}], east: () => [35, 90, {}], west: () => [35, 270, {}],
  tracker: () => [0, 180, { mounting: 'single-axis' }],
};
const VARIANTS = { base: {}, A: { moduleTemp: 'faiman' }, B: { moduleTemp: 'faiman', power: 'huld' } };
const study = F.sites.flatMap(s => {
  const h = hoursOf(s), y = monthly2020(s.name);
  return Object.entries(MOUNTINGS).map(([key, args]) => {
    const [tilt, az, o] = args(s), ref = s.pvgis[key];
    const row = { site: s.name, key, meanDay: M.monthlyYield(y, s.lat, tilt, az, o).annual / ref - 1 };
    for (const [v, vo] of Object.entries(VARIANTS)) row[v] = M.hourlyYield(h, s.lat, s.lon, tilt, az, { ...o, ...vo }).annual / ref - 1;
    return row;
  });
});
const fixed = study.filter(r => r.key !== 'tracker');

test('the decision rule of #61 fails: neither variant beats the mean day on fixed arrays', () => {
  // The rule: below the mean day on the 21 fixed cases and on all 28. When written, MAE against
  // PVGIS 2020, fixed / all: mean day 2.94 / 3.66 %; A (Faiman) 3.33 / 3.37 %; B (Faiman + Huld)
  // 3.40 / 3.64 %. Both pass on all 28 but not on the fixed arrays, so the app keeps the mean day.
  assert.equal(fixed.length, 21);
  for (const v of ['A', 'B']) {
    assert.ok(mae(fixed.map(r => r[v])) > mae(fixed.map(r => r.meanDay)), `${v} on fixed arrays`);
    assert.ok(mae(study.map(r => r[v])) < mae(study.map(r => r.meanDay)), `${v} on all 28`);
  }
});

test('but both make hourly data closer to PVGIS than the fixed +20 °C rule', () => {
  // When written, fixed / all / trackers: T + 20 °C 3.61 / 3.98 / 5.10 %; A 3.33 / 3.37 / 3.52 %;
  // B 3.40 / 3.64 / 4.35 %. Faiman modules run cooler than T + 20 °C, so A raises yields
  // (mean +1.6 % over all 28); Huld's low-light loss takes most of that back (B −1.6 %).
  const trackers = study.filter(r => r.key === 'tracker');
  for (const v of ['A', 'B']) {
    for (const rows of [fixed, study, trackers]) assert.ok(mae(rows.map(r => r[v])) < mae(rows.map(r => r.base)), v);
  }
  assert.ok(mean(study.map(r => r.A)) > mean(study.map(r => r.base)) + 0.02);
  assert.ok(mean(study.map(r => r.B)) < mean(study.map(r => r.A)) - 0.02);
});
