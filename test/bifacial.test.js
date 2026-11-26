// Run with: node --test
// Bifacial fixed rows: the rear side (issue #67).
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../solar-model.js');
const C = require('../capacity.js');
const F = require('./fixtures/bifacial-pvlib.json');

const SITES = {
  lisbon: [38.72, 35], warsaw: [52.23, 47], oslo: [59.91, 54], cairo: [30.04, 27],
  sydney: [-33.87, 30], madrid: [40.42, 36], johannesburg: [-26.2, 24],
};
const clim = (name) => M.parsePowerClimatology(require(`./fixtures/nasa-power-${name}.json`));

test('rear view factors: flat rows see only ground, the three views never exceed the whole', () => {
  const flat = M.rearViewFactors(0, 0.4);
  assert.ok(Math.abs(flat.sky) < 1e-12 && Math.abs(flat.ground - 1) < 1e-12);
  for (const tilt of [10, 30, 60, 90]) {
    for (const gcr of [0.2, 0.5, 0.9]) {
      const v = M.rearViewFactors(tilt, gcr);
      assert.ok(v.sky > 0 && v.ground > 0 && v.sky + v.ground <= 1 + 1e-12, `${tilt}° ${gcr}`);
    }
  }
  // Rows far apart: the rear sees half its own (1 − cos β)/2 sky and (1 + cos β)/2 ground, as a lone plane.
  const lone = M.rearViewFactors(30, 1e-4), c = Math.cos(30 * Math.PI / 180);
  assert.ok(Math.abs(lone.sky - (1 - c) / 2) < 1e-3 && Math.abs(lone.ground - (1 + c) / 2) < 1e-3);
});

test("the ground's sky view: open between sparse rows, closed under touching flat rows, the same at any height", () => {
  // Averaged over the pitch of infinite rows it does not depend on the height: pvlib's
  // vf_ground_sky_2d_integ gives 0.6223444302115 at 30°, GCR 0.4 for heights 0.4–4 alike.
  for (const h of [0.4, 1.2, 4]) assert.ok(Math.abs(M.groundSkyView(30, 0.4, h) - 0.6223444302115) < 5e-5, `${h}`);
  assert.ok(M.groundSkyView(30, 0.01, 1) > 0.97);
  assert.ok(M.groundSkyView(0, 1, 0.5) < 0.01);
  assert.ok(M.groundSkyView(30, 0.3, 1) > M.groundSkyView(30, 0.6, 1)); // denser rows hide more sky
  assert.throws(() => M.groundSkyView(30, 0.4, 0.2), /clear the ground/); // sin 30° / 2 = 0.25
});

test('the rear irradiation matches pvlib infinite sheds within 0.1 % at seven sites', () => {
  // pvlib 0.16.1 get_irradiance_poa on the rear, with the app's own mean-day moments as input
  // (tools/bifacial-moments.mjs, make-bifacial-pvlib.py). When written: within 0.03 %.
  assert.equal(F.cases.length, 7 * 12 * 4);
  const sums = new Map();
  for (const c of F.cases) {
    const [lat, tilt] = SITES[c.name], cl = clim(c.name), n = M.MEAN_DAY[c.month];
    const H = cl.ghi[c.month], Hd = Math.min(cl.diffuse[c.month], H), H0 = M.extraterrestrialDaily(lat, n);
    const A = H0 > 0 ? Math.min(1, (H - Hd) / H0) : 0;
    const r = M.rearDayIrradiation(lat, tilt, lat >= 0 ? 180 : 0, n, { H, Hd, profile: 'collares-pereira-rabl' },
      { gcr: c.gcr, height: c.height }, c.albedo, A);
    const key = `${c.name} ${c.gcr} ${c.height} ${c.albedo}`;
    const s = sums.get(key) ?? { js: { total: 0, sky: 0, ground: 0, beam: 0 }, py: { total: 0, sky: 0, ground: 0, beam: 0 } };
    for (const k of ['sky', 'ground', 'beam']) { s.js[k] += r[k]; s.py[k] += c[k]; }
    s.js.total += r.total; s.py.total += c.rear;
    sums.set(key, s);
  }
  assert.equal(sums.size, 28);
  for (const [key, { js, py }] of sums) {
    assert.ok(Math.abs(js.total / py.total - 1) < 0.001, `${key}: ${js.total} vs ${py.total}`);
    for (const k of ['sky', 'ground', 'beam']) assert.ok(Math.abs(js[k] - py[k]) < 0.001 * py.total, `${key} ${k}`);
  }
});

const lisbon = clim('lisbon');
const yieldWith = (o) => M.monthlyYield(lisbon, 38.72, 30, 180, o);
const base = { bifaciality: 0.8, bifacialGcr: 0.4, bifacialHeight: 1.2 };

test('bifacial yield: monofacial unchanged, more light from a brighter ground and sparser rows', () => {
  const mono = yieldWith({}), bi = yieldWith(base);
  assert.equal(mono.rearAnnual, 0);
  assert.equal(mono.annual, M.monthlyYield(lisbon, 38.72, 30, 180).annual);
  // When written: +8.0 % at Lisbon, 30°, GCR 0.4, centre 1.2 slant widths up, albedo 0.2.
  const gain = bi.annual / mono.annual - 1;
  assert.ok(gain > 0.05 && gain < 0.12, `${gain}`);
  // The rear adds in proportion to the bifaciality and to 1 − the racking loss.
  const half = yieldWith({ ...base, bifaciality: 0.4 }), noLoss = yieldWith({ ...base, rearLoss: 0 });
  assert.ok(Math.abs((bi.annual - mono.annual) / (half.annual - mono.annual) - 2) < 1e-9);
  assert.ok(Math.abs((bi.annual - mono.annual) / (noLoss.annual - mono.annual) - 0.98) < 1e-9);
  assert.ok(yieldWith({ ...base, groundAlbedo: 0.5 }).annual > bi.annual);
  assert.ok(yieldWith({ ...base, bifacialGcr: 0.7 }).annual < bi.annual);
});

test('a skyline that hides the sun also darkens the ground and the rear', () => {
  const walled = yieldWith({ ...base, horizon: new Array(48).fill(30) });
  assert.ok(walled.rearAnnual < yieldWith(base).rearAnnual * 0.9);
});

test('bifacial inputs are checked', () => {
  assert.throws(() => yieldWith({ ...base, mounting: 'single-axis' }), /fixed rows only/);
  assert.throws(() => yieldWith({ ...base, bifaciality: 1.2 }), /bifaciality/);
  assert.throws(() => yieldWith({ ...base, bifacialGcr: 0 }), /GCR/);
  assert.throws(() => yieldWith({ ...base, rearLoss: 1 }), /rear loss/);
});

test('the bifaciality setting: blank is monofacial, values are clamped', () => {
  assert.equal(C.bifacialitySetting(''), null);
  assert.equal(C.bifacialitySetting('0,75'), 0.75);
  assert.equal(C.bifacialitySetting(3), 1);
});
