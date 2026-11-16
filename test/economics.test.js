// Run with: node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../economics.js');

const close = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test('without discounting or degradation LCOE is total cost over total energy', () => {
  // (1000 + 25 · 10) / (25 · 1000 kWh)
  close(E.lcoe({ capex: 1000, om: 10, yieldKwh: 1000, rate: 0, degradation: 0, lifetime: 25 }), 0.05);
});

test('with discounting and no O&M, LCOE is the investment over an annuity of energy', () => {
  const annuity = (1 - 1.05 ** -25) / 0.05; // 14.0939…
  close(E.lcoe({ capex: 1000, yieldKwh: 1000, rate: 0.05, degradation: 0, lifetime: 25 }), 1000 / (1000 * annuity));
});

test('selling at the LCOE gives NPV = 0 at the same rate', () => {
  const inputs = { capex: 3200, om: 45, yieldKwh: 990, rate: 0.06, degradation: 0.005, lifetime: 30 };
  const price = E.lcoe(inputs);
  close(E.npv(inputs.rate, E.cashFlows({ ...inputs, price })), 0, 1e-8);
});

test('IRR is where NPV crosses zero; negative when the project loses money', () => {
  const flows = E.cashFlows({ capex: 1000, price: 0.1, yieldKwh: 1000, degradation: 0, lifetime: 25 }); // 100 a year
  const r = E.irr(flows);
  close(E.npv(r, flows), 0, 1e-6);
  close((1 - (1 + r) ** -25) / r, 10, 1e-6); // the annuity factor of a 10-year payback
  const losing = E.irr(E.cashFlows({ capex: 1000, price: 0.01, yieldKwh: 1000, degradation: 0, lifetime: 25 }));
  assert.ok(losing < 0); // earns back 250 of 1000
  // O&M above revenue: no positive year, no rate makes NPV zero.
  assert.equal(E.irr(E.cashFlows({ capex: 1000, price: 0.01, yieldKwh: 1000, om: 20, lifetime: 25 })), null);
});

test('payback counts degradation and O&M and interpolates within the year', () => {
  close(E.payback(E.cashFlows({ capex: 1000, price: 0.1, yieldKwh: 1000, degradation: 0, lifetime: 25 })), 10);
  close(E.payback([-250, 100, 100, 100]), 2.5);
  const degraded = E.payback(E.cashFlows({ capex: 1000, price: 0.1, yieldKwh: 1000, degradation: 0.005, lifetime: 25 }));
  assert.ok(degraded > 10 && degraded < 10.3, String(degraded));
  const withOm = E.payback(E.cashFlows({ capex: 1000, price: 0.1, yieldKwh: 1000, om: 20, degradation: 0, lifetime: 25 }));
  close(withOm, 12.5); // 80 a year net
  assert.equal(E.payback(E.cashFlows({ capex: 1000, price: 0.01, yieldKwh: 1000, lifetime: 25 })), null);
});

test('energy degrades geometrically from the first year', () => {
  const e = E.energyByYear(1000, 0.005, 3);
  assert.deepEqual(e.map(x => Math.round(x * 1000) / 1000), [1000, 995, 990.025]);
  assert.equal(E.DEFAULTS.degradation, 0.005);
  assert.equal(E.DEFAULTS.lifetime, 25);
});

test('evaluate: a lower (P90) yield costs more per kWh and pays back later', () => {
  const base = { capex: 3200, price: 0.75, om: 40, rate: 0.05 };
  const p50 = E.evaluate({ ...base, yieldKwh: 990 });
  const p90 = E.evaluate({ ...base, yieldKwh: 936 });
  close(p50.firstYearRevenue, 742.5);
  assert.ok(p90.lcoe > p50.lcoe && p90.payback > p50.payback && p90.npv < p50.npv && p90.irr < p50.irr);
});

// ─── Tracker against fixed (issue #55) ───

test('break-even extra investment: at exactly that extra cost the two NPVs are equal', () => {
  const base = { capex: 650, price: 0.08, om: 12, rate: 0.06, degradation: 0.005, lifetime: 30 };
  const fixed = { yieldKwh: 1045 }, tracker = { altYieldKwh: 1138, extraOm: 3 };
  const extra = E.breakEvenExtraInvestment({ ...base, ...fixed, ...tracker });
  const npvFixed = E.evaluate({ ...base, yieldKwh: 1045 }).npv;
  const npvTracker = E.evaluate({ ...base, capex: base.capex + extra, om: base.om + 3, yieldKwh: 1138 }).npv;
  close(npvTracker, npvFixed, 1e-9);
  assert.ok(extra > 0);
});

test('break-even: without degradation it is price × discounted extra energy, minus discounted extra O&M', () => {
  const base = { capex: 1000, price: 0.1, om: 0, rate: 0.05, degradation: 0, lifetime: 20 };
  const annuity = (1 - 1.05 ** -20) / 0.05;
  close(E.breakEvenExtraInvestment({ ...base, yieldKwh: 1000, altYieldKwh: 1100 }), 100 * 0.1 * annuity, 1e-9);
  close(E.breakEvenExtraInvestment({ ...base, yieldKwh: 1000, altYieldKwh: 1100, extraOm: 4 }), (10 - 4) * annuity, 1e-9);
  // Less energy than the fixed array: worth less even at no extra cost.
  assert.ok(E.breakEvenExtraInvestment({ ...base, yieldKwh: 1000, altYieldKwh: 990 }) < 0);
  // The investment itself cancels out.
  close(E.breakEvenExtraInvestment({ ...base, capex: 5, yieldKwh: 1000, altYieldKwh: 1100 }),
    E.breakEvenExtraInvestment({ ...base, capex: 5000, yieldKwh: 1000, altYieldKwh: 1100 }), 1e-9);
});

test('amounts typed by people: spaces, decimal commas, empty', () => {
  assert.equal(E.parseAmount('3 200'), 3200);
  assert.equal(E.parseAmount('0,85'), 0.85);
  assert.equal(E.parseAmount(''), null);
  assert.equal(E.parseAmount('abc'), null);
  assert.equal(E.parseAmount(undefined), null);
});
