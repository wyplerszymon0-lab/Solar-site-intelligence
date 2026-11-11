// ─── Capacity of the whole site ─────────────────────────────
// How many kWp fit on the surveyed area, from the ground coverage ratio of the row
// layout and the module efficiency (issue #45). Everything else in the app is per
// kWp; multiplying by this capacity gives the whole site. DC capacity at standard test
// conditions (1 kW/m²): no inverter sizing, no AC limit. Works in the browser
// (window.SiteCapacity) and in Node (require).

(function (root) {
  const DEG = Math.PI / 180;
  const STC_IRRADIANCE_KW_M2 = 1; // standard test conditions
  const DEFAULTS = {
    moduleEfficiency: 0.21, // typical of current crystalline-silicon modules (about 20–23%)
    usableShare: 1,         // share of the area that takes rows; 1 = gross, nothing deducted
  };
  const MIN_SUN_ELEVATION_DEG = 3; // below this there is no sensible row spacing

  // Sun elevation at solar noon on the winter solstice (declination ∓23.45°).
  function winterNoonElevation(lat) {
    return 90 - (Math.abs(lat) + 23.45);
  }

  // Ground coverage ratio: module area over ground area, for rows spaced so that one row
  // does not shade the next at winter-solstice noon. Rows of slant height h at tilt β
  // need a pitch of h (cos β + sin β / tan α), α the sun elevation then, so
  // GCR = h / pitch = 1 / (cos β + sin β / tan α): the row height cancels out.
  // null where the winter sun barely rises (polar sites).
  function groundCoverageRatio(lat, tiltDeg) {
    if (!Number.isFinite(lat) || !Number.isFinite(tiltDeg) || tiltDeg < 0 || tiltDeg > 90) {
      throw new Error('latitude and a tilt of 0–90° are needed');
    }
    const elevation = winterNoonElevation(lat);
    if (elevation <= MIN_SUN_ELEVATION_DEG) return null;
    const beta = tiltDeg * DEG;
    return 1 / (Math.cos(beta) + Math.sin(beta) / Math.tan(elevation * DEG));
  }

  // kWp on areaM2 of ground: area × usable share × GCR is the module area, and each m²
  // of module gives its efficiency in kW at 1 kW/m². haPerMWp is the land per MWp.
  function siteCapacity({ areaM2, gcr, moduleEfficiency = DEFAULTS.moduleEfficiency, usableShare = DEFAULTS.usableShare }) {
    const valid = (v, lo, hi) => Number.isFinite(v) && v > lo && v <= hi;
    if (!(Number.isFinite(areaM2) && areaM2 >= 0)) throw new Error('area must be a non-negative number');
    if (!valid(gcr, 0, 1)) throw new Error('GCR must be in (0, 1]');
    if (!valid(moduleEfficiency, 0, 0.5)) throw new Error('module efficiency must be in (0, 50%]');
    if (!valid(usableShare, 0, 1)) throw new Error('usable share must be in (0, 100%]');
    const moduleAreaM2 = areaM2 * usableShare * gcr;
    const kWp = moduleAreaM2 * moduleEfficiency * STC_IRRADIANCE_KW_M2;
    return {
      kWp, moduleAreaM2,
      haPerMWp: kWp > 0 ? (areaM2 / 10000) / (kWp / 1000) : null,
    };
  }

  // A user setting in percent (input field or localStorage) as a fraction, clamped to
  // [min, max] percent; anything unusable gives the default.
  function percentSetting(input, fallback, minPct, maxPct) {
    const pct = typeof input === 'number' ? input : parseFloat(String(input ?? '').replace(',', '.'));
    if (!Number.isFinite(pct)) return fallback;
    return Math.min(Math.max(pct, minPct), maxPct) / 100;
  }
  const moduleEfficiencyFraction = (input) => percentSetting(input, DEFAULTS.moduleEfficiency, 5, 30);
  const usableShareFraction = (input) => percentSetting(input, DEFAULTS.usableShare, 10, 100);

  const api = {
    winterNoonElevation, groundCoverageRatio, siteCapacity,
    moduleEfficiencyFraction, usableShareFraction, DEFAULTS, MIN_SUN_ELEVATION_DEG,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SiteCapacity = api;
})(typeof window !== 'undefined' ? window : globalThis);
