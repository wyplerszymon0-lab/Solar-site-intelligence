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
    // Single-axis tracker rows (issue #53): the middle of the 0.25–0.40 that Bolinger &
    // Bolinger (2022, IEEE J. Photovoltaics) give as typical for US tracking plants.
    trackerGcr: 0.33,
    trackerLimit: null,     // degrees from flat; null = no rotation limit (PVGIS, pvlib default)
  };
  const TRACKER_GCR_RANGE = [0.1, 0.9];
  const MIN_SUN_ELEVATION_DEG = 3; // below this there is no sensible row spacing

  // Sun elevation at solar noon on the winter solstice (declination ∓23.45°).
  function winterNoonElevation(lat) {
    return 90 - (Math.abs(lat) + 23.45);
  }

  // Horizontal pitch of the rows per metre of slant height, so that one row does not shade
  // the next at winter-solstice noon (sun elevation α). Tilt β is from horizontal and grade
  // is the ground's rise per metre going away from the equator, positive on an
  // equator-facing slope (issue #65): (sin β + cos β tan α) / (tan α + grade). On flat
  // ground that is cos β + sin β / tan α. Never below 1: the modules cannot cover more than
  // the ground (GCR ≤ 1). null where the winter sun is at most 3° up (polar sites), or where
  // the ground falls away from the equator so much that it is no higher above the slope.
  function rowPitchFactor(lat, tiltDeg, grade = 0) {
    if (!Number.isFinite(lat) || !Number.isFinite(tiltDeg) || tiltDeg < 0 || tiltDeg > 90) {
      throw new Error('latitude and a tilt of 0–90° are needed');
    }
    if (!Number.isFinite(grade)) throw new Error('the grade must be a number');
    const elevation = winterNoonElevation(lat);
    if (elevation <= MIN_SUN_ELEVATION_DEG) return null;
    const beta = tiltDeg * DEG, tanSun = Math.tan(elevation * DEG);
    if (tanSun + grade <= Math.tan(MIN_SUN_ELEVATION_DEG * DEG)) return null;
    return Math.max(1, (Math.sin(beta) + Math.cos(beta) * tanSun) / (tanSun + grade));
  }

  // Ground coverage ratio: module area over (horizontal) ground area = row height / pitch,
  // so the row height cancels out. null where there is no row layout.
  function groundCoverageRatio(lat, tiltDeg, grade = 0) {
    const pitch = rowPitchFactor(lat, tiltDeg, grade);
    return pitch == null ? null : 1 / pitch;
  }

  // The grade rowPitchFactor needs, from the rise going north in percent (terrainPlane).
  function gradeAwayFromEquator(lat, gradeNorthPct) {
    return (lat >= 0 ? gradeNorthPct : -gradeNorthPct) / 100;
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

  // Tracker settings. The GCR is entered as a ratio (0.33), clamped to 0.1–0.9; the
  // rotation limit in degrees, clamped to 0–90, and blank or unusable means none.
  const parseNumber = (input) => (typeof input === 'number' ? input : parseFloat(String(input ?? '').replace(',', '.')));
  function trackerGcrSetting(input) {
    const v = parseNumber(input);
    if (!Number.isFinite(v)) return DEFAULTS.trackerGcr;
    return Math.min(Math.max(v, TRACKER_GCR_RANGE[0]), TRACKER_GCR_RANGE[1]);
  }
  function trackerLimitSetting(input) {
    const v = parseNumber(input);
    if (!Number.isFinite(v)) return DEFAULTS.trackerLimit;
    return Math.min(Math.max(v, 0), 90);
  }

  // Bifacial modules (issue #67): the bifaciality factor from the module's datasheet, blank
  // or unusable = monofacial (null), else clamped to 0.1–1.
  function bifacialitySetting(input) {
    const v = parseNumber(input);
    return Number.isFinite(v) ? Math.min(Math.max(v, 0.1), 1) : null;
  }

  const api = {
    bifacialitySetting,
    winterNoonElevation, rowPitchFactor, groundCoverageRatio, gradeAwayFromEquator, siteCapacity,
    moduleEfficiencyFraction, usableShareFraction, trackerGcrSetting, trackerLimitSetting,
    DEFAULTS, MIN_SUN_ELEVATION_DEG, TRACKER_GCR_RANGE,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SiteCapacity = api;
})(typeof window !== 'undefined' ? window : globalThis);
