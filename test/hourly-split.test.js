// Run with: node --test
// Is NASA's hourly beam/diffuse split why fixed arrays come out low on hourly data? (issue #59)
// Answer: no. The split is consistent and an Erbs re-split does worse; most of the gap
// between hourly data and the mean day on fixed arrays is the temperature rule.
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
const mae = (xs) => mean(xs.map(Math.abs));
const DAYS_2020 = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const COS_87 = Math.cos(87 * Math.PI / 180);

// Erbs et al. (1982) hourly decomposition of GHI, with pvlib's guards: the clearness index uses
// cos Z ≥ 0.065 and is capped at 2; above 87° of zenith, or if DNI would be negative, it is all diffuse.
function erbs(ghi, cosZ, e0) {
  const kt = Math.min(2, Math.max(0, ghi / (e0 * Math.max(cosZ, 0.065))));
  const kd = kt <= 0.22 ? 1 - 0.09 * kt
    : kt <= 0.8 ? 0.9511 - 0.1604 * kt + 4.388 * kt ** 2 - 16.638 * kt ** 3 + 12.336 * kt ** 4
      : 0.165;
  const dhi = kd * ghi, dni = (ghi - dhi) / cosZ;
  return cosZ < COS_87 || ghi < 0 || !(dni >= 0) ? { dhi: ghi, dni: 0 } : { dhi, dni };
}

// NASA's GHI, split again by Erbs, with the sun at mid-hour as in hourlyYield.
function erbsHours(h, lat, lon) {
  const out = { ...h, diffuse: [], dni: [] };
  h.ghi.forEach((G, i) => {
    if (G == null) { out.diffuse.push(null); out.dni.push(null); return; }
    const s = M.sunPosition(lat, lon, h.startMs + i * 3600000 + 1800000);
    const { dhi, dni } = erbs(G, s.up, 1367 * (1 + 0.033 * Math.cos(2 * Math.PI * s.dayOfYear / 365)));
    out.diffuse.push(dhi); out.dni.push(dni);
  });
  return out;
}

test('the Erbs split matches pvlib 0.16.1', () => {
  // pvlib.irradiance.erbs(ghi, zenith, doy); e0 is pvlib's own dni_extra for that day.
  const cases = [
    [800, 30, 1321.62, 196.4798, 696.8851], [400, 60, 1321.62, 171.1142, 457.7716],
    [150, 80, 1412.71, 62.1545, 505.8822], [50, 86, 1376.89, 30.7743, 275.6112],
    [300, 88, 1376.89, 300, 0], [900, 20, 1321.77, 188.6148, 757.0403], [100, 45, 1413.68, 99.0997, 1.2733],
  ];
  for (const [ghi, zenith, e0, dhi, dni] of cases) {
    const r = erbs(ghi, Math.cos(zenith * Math.PI / 180), e0);
    assert.ok(Math.abs(r.dhi - dhi) < 0.01 && Math.abs(r.dni - dni) < 0.01, `${ghi} at ${zenith}°: ${r.dhi} ${r.dni}`);
  }
});

test("NASA's hourly columns agree with each other: DNI·cos Z + DHI is within 3 % of GHI", () => {
  // When written: −2.6 % (Johannesburg) to +1.8 % (Lisbon) over the year's daylight hours.
  for (const s of F.sites) {
    const h = hoursOf(s);
    let ghi = 0, closure = 0;
    h.ghi.forEach((G, i) => {
      if (!(G > 0)) return;
      const up = M.sunPosition(s.lat, s.lon, h.startMs + i * 3600000 + 1800000).up;
      ghi += G; closure += h.dni[i] * Math.max(0, up) + h.diffuse[i];
    });
    assert.ok(Math.abs(closure / ghi - 1) < 0.03, `${s.name}: ${(closure / ghi - 1) * 100} %`);
  }
});

const MOUNTINGS = {
  equator: (s) => [s.tilt, s.lat >= 0 ? 180 : 0, {}], east: () => [35, 90, {}], west: () => [35, 270, {}],
  tracker: () => [0, 180, { mounting: 'single-axis' }],
};
const study = F.sites.flatMap(s => {
  const h = hoursOf(s), e = erbsHours(h, s.lat, s.lon), y = monthly2020(s.name);
  return Object.entries(MOUNTINGS).map(([key, args]) => {
    const [tilt, az, o] = args(s), ref = s.pvgis[key];
    const run = (opts) => ({
      nasa: M.hourlyYield(h, s.lat, s.lon, tilt, az, { ...o, ...opts }).annual,
      erbs: M.hourlyYield(e, s.lat, s.lon, tilt, az, { ...o, ...opts }).annual,
      meanDay: M.monthlyYield(y, s.lat, tilt, az, { ...o, ...opts }).annual,
    });
    const full = run({}), noTemp = run({ tempCoeff: 0 });
    return {
      site: s.name, key,
      nasa: full.nasa / ref - 1, erbs: full.erbs / ref - 1, meanDay: full.meanDay / ref - 1,
      gap: full.nasa / full.meanDay - 1, gapNoTemp: noTemp.nasa / noTemp.meanDay - 1,
    };
  });
});

test('an Erbs re-split does not rescue hourly data: the decision rule of #59 fails', () => {
  // When written, fixed arrays (21): NASA split 3.61 %, Erbs 3.74 %, mean day 2.94 %;
  // all 28: 3.98, 4.89 and 3.66 %. Erbs puts more of the light in the diffuse part at six sites
  // of seven, which lowers tilted and tracking arrays further.
  const fixed = study.filter(r => r.key !== 'tracker');
  assert.equal(fixed.length, 21);
  assert.ok(mae(fixed.map(r => r.erbs)) > mae(fixed.map(r => r.meanDay)), 'the rule: Erbs below the mean day');
  assert.ok(mae(study.map(r => r.erbs)) > mae(study.map(r => r.nasa)));
  assert.ok(mean(fixed.map(r => r.erbs)) < mean(fixed.map(r => r.nasa)));
});

test('the daylight hours are warmer than the monthly mean temperature at every site', () => {
  // The T + 20 °C rule was set for the mean day, whose temperature is the 24-hour mean. Hourly
  // data apply it to the actual hour, and the hours that make energy are the warm ones.
  // When written, irradiance-weighted: 1.5 (Lisbon) to 5.7 °C (Johannesburg) above.
  for (const s of F.sites) {
    const h = hoursOf(s), y = monthly2020(s.name);
    let wt = 0, w = 0;
    h.ghi.forEach((G, i) => { if (G > 0) { wt += G * h.temp[i]; w += G; } });
    const monthlyT = y.temp.reduce((a, t, m) => a + t * y.ghi[m] * DAYS_2020[m], 0) /
      y.ghi.reduce((a, g, m) => a + g * DAYS_2020[m], 0);
    assert.ok(wt / w - monthlyT > 1, `${s.name}: ${wt / w} against ${monthlyT}`);
  }
});

test('without the temperature term, hourly data and the mean day agree on equator-facing arrays', () => {
  // When written, hourly over mean day, equator-facing: −1.7 % with the temperature term,
  // −0.2 % without it. East, west and trackers keep a gap without it (−1.4, −2.6, −6.2 %):
  // that part is the mean day's morning/afternoon symmetry and low-sun beam (#41, #51).
  const eq = study.filter(r => r.key === 'equator');
  assert.ok(mean(eq.map(r => r.gap)) < -0.01);
  assert.ok(Math.abs(mean(eq.map(r => r.gapNoTemp))) < 0.005);
  for (const key of ['east', 'west', 'tracker']) {
    const rs = study.filter(r => r.key === key);
    assert.ok(mean(rs.map(r => r.gapNoTemp)) < -0.01, key);
  }
});
