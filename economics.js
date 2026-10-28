// ─── Project economics per kWp ──────────────────────────────
// Cash flows of 1 kWp over its lifetime from the annual yield and the user's own
// prices (any currency), so nothing depends on the plant size. Year 0 is the
// investment; in year t = 1…L the array produces Y·(1 − d)^(t−1) kWh, worth that
// times the energy price, minus a fixed O&M cost. All money is in real terms
// (today's prices), discounted at a real rate. Left out: taxes, subsidies, loans,
// inverter replacement, decommissioning. Works in the browser (window.SolarEconomics)
// and in Node (require).

(function (root) {
  const DEFAULTS = {
    degradation: 0.005, // per year; median of field measurements (Jordan & Kurtz 2013, NREL)
    lifetime: 25,       // years; the usual module performance warranty
    om: 0,              // O&M per kWp per year, in the user's currency
  };

  // Energy in each year 1…lifetime, kWh per kWp.
  function energyByYear(yieldKwh, degradation, lifetime) {
    return Array.from({ length: lifetime }, (_, i) => yieldKwh * (1 - degradation) ** i);
  }

  // flows[0] is year 0 (the investment, negative), flows[t] the net cash of year t.
  function cashFlows({ capex, price, yieldKwh, om = DEFAULTS.om, degradation = DEFAULTS.degradation, lifetime = DEFAULTS.lifetime }) {
    return [-capex, ...energyByYear(yieldKwh, degradation, lifetime).map(e => e * price - om)];
  }

  function npv(rate, flows) {
    return flows.reduce((s, cash, t) => s + cash / (1 + rate) ** t, 0);
  }

  // Rate at which NPV = 0, by bisection. With one investment followed by positive
  // years NPV falls as the rate rises, so there is at most one root. A project that
  // never earns its investment back has a negative IRR; null when no year is
  // positive at all (O&M above revenue) or the rate would exceed 100 % a year.
  function irr(flows) {
    let lo = -0.99, hi = 1;
    if (npv(lo, flows) < 0 || npv(hi, flows) > 0) return null;
    for (let i = 0; i < 200; i++) {
      const mid = (lo + hi) / 2;
      if (npv(mid, flows) > 0) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  // Years until the cumulative cash flow turns positive, interpolated within the
  // year (cash assumed spread evenly over it); null if it never does.
  function payback(flows) {
    let cumulative = flows[0];
    for (let t = 1; t < flows.length; t++) {
      if (cumulative + flows[t] >= 0) return t - 1 + (flows[t] > 0 ? -cumulative / flows[t] : 0);
      cumulative += flows[t];
    }
    return null;
  }

  // Levelised cost of energy: discounted lifetime costs over discounted lifetime
  // energy, per kWh. An energy price equal to the LCOE gives NPV = 0 at that rate.
  function lcoe({ capex, yieldKwh, rate, om = DEFAULTS.om, degradation = DEFAULTS.degradation, lifetime = DEFAULTS.lifetime }) {
    const energy = energyByYear(yieldKwh, degradation, lifetime);
    const costs = capex + energy.reduce((s, _, i) => s + om / (1 + rate) ** (i + 1), 0);
    const discountedEnergy = energy.reduce((s, e, i) => s + e / (1 + rate) ** (i + 1), 0);
    return costs / discountedEnergy;
  }

  // Everything the UI shows, for one annual yield.
  function evaluate(inputs) {
    const flows = cashFlows(inputs);
    return {
      firstYearRevenue: inputs.yieldKwh * inputs.price,
      payback: payback(flows),
      lcoe: lcoe(inputs),
      npv: npv(inputs.rate, flows),
      irr: irr(flows),
    };
  }

  // A number typed by the user ("1 200", "0,85") or null when empty or unusable.
  function parseAmount(input) {
    const s = String(input ?? '').replace(/\s/g, '').replace(',', '.');
    if (s === '') return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  const api = { cashFlows, npv, irr, payback, lcoe, evaluate, parseAmount, energyByYear, DEFAULTS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SolarEconomics = api;
})(typeof window !== 'undefined' ? window : globalThis);
