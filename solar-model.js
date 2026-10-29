// ─── PV yield model from satellite irradiance ────────────────
// Monthly energy yield of a fixed PV array from NASA POWER climatology
// (20-year monthly means of global and diffuse horizontal irradiance and
// air temperature). Irradiance is transposed to the tilted plane with the
// isotropic-sky model (Liu & Jordan; Duffie & Beckman, "Solar Engineering of
// Thermal Processes", §2.19). The beam tilt factor R_b is integrated over the
// day of each month's recommended average date, which handles any tilt,
// azimuth and hemisphere with one formula. Reflection losses at the module
// glass use the ASHRAE incidence-angle modifier. Validated against PVGIS in
// the README. Works in the browser (window.SolarModel) and in Node (require).

(function (root) {
  const DEG = Math.PI / 180;

  // Klein's recommended average day of each month (Duffie & Beckman, Table 1.6.1).
  const MEAN_DAY = [17, 47, 75, 105, 135, 162, 198, 228, 258, 288, 318, 344];
  const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const MONTH_KEYS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

  const DEFAULTS = {
    systemLoss: 0.14,        // wiring, inverter, soiling, mismatch — same as PVGIS's default input
    tempCoeff: -0.004,       // power change per °C of cell temperature, typical crystalline silicon
    cellTempRise: 20,        // cell above ambient while producing, °C (≈ NOCT behaviour)
    groundAlbedo: 0.2,       // standard ground reflectance; NASA's 1° cell albedo is skewed by nearby sea
    iamB0: 0.05,             // ASHRAE incidence-angle modifier for glass-covered modules; 0 disables it
    horizon: null,           // skyline profile (see horizonAt); null = open horizon
  };

  function declination(n) {
    return 23.45 * Math.sin(2 * Math.PI * (284 + n) / 365);
  }

  // Share of light that passes the module glass at incidence angle θ (ASHRAE model):
  // 1 − b0·(1/cos θ − 1). Steep angles reflect more, which matters most for
  // east/west, north-facing and flat arrays.
  function incidenceModifier(cosTheta, b0) {
    if (cosTheta <= 0) return 0;
    return Math.max(0, 1 - b0 * (1 / cosTheta - 1));
  }

  // Effective incidence angles of isotropic sky and ground radiation on a surface
  // tilted by `tilt` degrees (Brandemuehl & Beckman; Duffie & Beckman eq. 5.4.1–5.4.2).
  const skyIncidenceDeg = (tilt) => 59.7 - 0.1388 * tilt + 0.001497 * tilt * tilt;
  const groundIncidenceDeg = (tilt) => 90 - 0.5788 * tilt + 0.002693 * tilt * tilt;

  // ─── Horizon ───
  // A horizon profile is the elevation angle of the skyline, in degrees, at equally
  // spaced compass azimuths starting at north (index 0 = 0°, then clockwise).
  // horizonAt() interpolates it linearly, wrapping round at north.
  function horizonAt(horizon, compassAz) {
    const n = horizon.length, step = 360 / n;
    const x = ((compassAz % 360) + 360) % 360 / step;
    const i = Math.floor(x) % n, f = x - Math.floor(x);
    return horizon[i] * (1 - f) + horizon[(i + 1) % n] * f;
  }

  // Sun elevation and compass azimuth (°) on day n at hour angle w (°, 0 = solar noon),
  // every stepDeg of hour angle while the sun is up: for drawing the sun's path.
  function sunPath(lat, n, stepDeg = 2.5) {
    const phi = lat * DEG, d = declination(n) * DEG, path = [];
    for (let w = -180; w <= 180; w += stepDeg) {
      const omega = w * DEG;
      const sinAlt = Math.cos(phi) * Math.cos(d) * Math.cos(omega) + Math.sin(phi) * Math.sin(d);
      if (sinAlt <= 0) continue;
      const azS = Math.atan2(Math.sin(omega) * Math.cos(d), Math.sin(phi) * Math.cos(d) * Math.cos(omega) - Math.cos(phi) * Math.sin(d));
      path.push({ elevation: Math.asin(sinAlt) / DEG, compassAz: ((azS / DEG + 180) % 360 + 360) % 360 });
    }
    return path;
  }

  // Ratio of daily beam irradiation on the tilted surface to that on the horizontal,
  // optionally after glass reflection losses (b0 > 0). With a horizon profile, hours
  // when the sun is below the skyline add nothing to the plane; the horizontal sum
  // stays unshaded, because the satellite irradiance it scales is for open terrain.
  // Only the beam is shaded: also removing the sky behind the skyline from the
  // isotropic diffuse doubled the gap to PVGIS at five mountain sites (README).
  // tilt in degrees; compassAz in degrees (0 = N, 90 = E, 180 = S).
  function beamTiltFactor(lat, tilt, compassAz, n, b0 = 0, horizon = null) {
    const phi = lat * DEG, beta = tilt * DEG;
    const gamma = (compassAz - 180) * DEG; // surface azimuth from south, west positive
    const d = declination(n) * DEG;
    let onPlane = 0, onHorizontal = 0;
    for (let w = -180; w < 180; w += 0.5) {
      const omega = w * DEG;
      const cosZ = Math.cos(phi) * Math.cos(d) * Math.cos(omega) + Math.sin(phi) * Math.sin(d);
      if (cosZ <= 0) continue; // sun below the horizon
      const cosT =
        Math.sin(d) * Math.sin(phi) * Math.cos(beta) -
        Math.sin(d) * Math.cos(phi) * Math.sin(beta) * Math.cos(gamma) +
        Math.cos(d) * Math.cos(phi) * Math.cos(beta) * Math.cos(omega) +
        Math.cos(d) * Math.sin(phi) * Math.sin(beta) * Math.cos(gamma) * Math.cos(omega) +
        Math.cos(d) * Math.sin(beta) * Math.sin(gamma) * Math.sin(omega);
      onHorizontal += cosZ;
      if (horizon) {
        // Sun azimuth from south, west positive, then as a compass bearing.
        const azS = Math.atan2(Math.sin(omega) * Math.cos(d), Math.sin(phi) * Math.cos(d) * Math.cos(omega) - Math.cos(phi) * Math.sin(d));
        if (Math.asin(Math.min(1, cosZ)) / DEG < horizonAt(horizon, azS / DEG + 180)) continue;
      }
      onPlane += Math.max(0, cosT) * (b0 > 0 ? incidenceModifier(cosT, b0) : 1);
    }
    return onHorizontal > 0 ? onPlane / onHorizontal : 0;
  }

  // climatology: { ghi[12], diffuse[12] } in kWh/m²/day and { temp[12] } in °C.
  // Returns monthly and annual yield in kWh per kWp, plus plane-of-array irradiation.
  function monthlyYield(climatology, lat, tilt, compassAz, options = {}) {
    const o = { ...DEFAULTS, ...options };
    const cosB = Math.cos(tilt * DEG);
    const kSky = (o.iamB0 > 0 ? incidenceModifier(Math.cos(skyIncidenceDeg(tilt) * DEG), o.iamB0) : 1);
    const kGround = o.iamB0 > 0 ? incidenceModifier(Math.cos(groundIncidenceDeg(tilt) * DEG), o.iamB0) : 1;
    const months = MEAN_DAY.map((n, m) => {
      const H = climatology.ghi[m];
      const Hd = Math.min(climatology.diffuse[m], H);
      const Rb = beamTiltFactor(lat, tilt, compassAz, n, o.iamB0, o.horizon);
      const poaDaily = (H - Hd) * Rb + Hd * (1 + cosB) / 2 * kSky + H * o.groundAlbedo * (1 - cosB) / 2 * kGround;
      const cellTemp = climatology.temp[m] + o.cellTempRise;
      const tempFactor = 1 + o.tempCoeff * (cellTemp - 25);
      const poa = poaDaily * DAYS_IN_MONTH[m];
      return { poa, yield: poa * (1 - o.systemLoss) * tempFactor };
    });
    const sum = (k) => months.reduce((s, x) => s + x[k], 0);
    return {
      monthly: months.map(x => x.yield),
      annual: sum('yield'),
      poaAnnual: sum('poa'),
    };
  }

  // Annual yield for every whole-degree tilt from 0 to maxTilt at a fixed azimuth.
  // Index i is the yield at i degrees.
  function tiltCurve(climatology, lat, compassAz, maxTilt = 75, options = {}) {
    const curve = [];
    for (let tilt = 0; tilt <= maxTilt; tilt++) {
      curve.push(monthlyYield(climatology, lat, tilt, compassAz, options).annual);
    }
    return curve;
  }

  // Parse the NASA POWER climatology JSON into the monthly arrays above.
  function parsePowerClimatology(json) {
    const p = json?.properties?.parameter;
    const series = (name) => MONTH_KEYS.map(k => p?.[name]?.[k]);
    const clim = { ghi: series('ALLSKY_SFC_SW_DWN'), diffuse: series('ALLSKY_SFC_SW_DIFF'), temp: series('T2M') };
    const valid = Object.values(clim).every(arr => arr.every(v => typeof v === 'number' && v > -900));
    if (!valid) throw new Error('NASA POWER returned incomplete climatology for this location');
    return clim;
  }

  function powerClimatologyUrl(lat, lon) {
    return 'https://power.larc.nasa.gov/api/temporal/climatology/point' +
      '?parameters=ALLSKY_SFC_SW_DWN,ALLSKY_SFC_SW_DIFF,T2M&community=RE' +
      `&latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&format=JSON`;
  }

  // ─── Year-to-year variability ───
  // The same parameters month by month for each year. 2001 is where NASA POWER's
  // CERES-based irradiance starts (the source of the climatology above); earlier
  // years come from another satellite product and would mix two records.
  const FIRST_SERIES_YEAR = 2001;
  const MIN_SERIES_YEARS = 10;
  function powerMonthlyUrl(lat, lon, lastYear, firstYear = FIRST_SERIES_YEAR) {
    return 'https://power.larc.nasa.gov/api/temporal/monthly/point' +
      '?parameters=ALLSKY_SFC_SW_DWN,ALLSKY_SFC_SW_DIFF,T2M&community=RE' +
      `&latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&start=${firstYear}&end=${lastYear}&format=JSON`;
  }

  // One climatology-shaped entry per complete year: [{ year, ghi[12], diffuse[12], temp[12] }].
  // Years with a month missing (fill value −999, or not published yet) are left out.
  function parsePowerMonthly(json) {
    const p = json?.properties?.parameter;
    const names = { ghi: 'ALLSKY_SFC_SW_DWN', diffuse: 'ALLSKY_SFC_SW_DIFF', temp: 'T2M' };
    const years = [...new Set(Object.keys(p?.ALLSKY_SFC_SW_DWN ?? {}).map(k => k.slice(0, 4)))].sort();
    const series = [];
    years.forEach(y => {
      const entry = { year: Number(y) };
      Object.entries(names).forEach(([field, name]) => {
        entry[field] = MONTH_KEYS.map((_, m) => p?.[name]?.[y + String(m + 1).padStart(2, '0')]);
      });
      const complete = ['ghi', 'diffuse', 'temp'].every(f => entry[f].every(v => typeof v === 'number' && v > -900));
      if (complete) series.push(entry);
    });
    if (series.length < MIN_SERIES_YEARS) {
      throw new Error(`NASA POWER returned ${series.length} complete years for this location; at least ${MIN_SERIES_YEARS} are needed`);
    }
    return series;
  }

  // Annual yield of every year in the series, at one tilt and azimuth.
  function yearlyYields(series, lat, tilt, compassAz, options = {}) {
    return series.map(y => ({ year: y.year, annual: monthlyYield(y, lat, tilt, compassAz, options).annual }));
  }

  // Spread of annual yields across years. P50 and P90 follow the usual convention in
  // PV energy assessments, a normal distribution: P50 = mean, P90 = mean − 1.2816 σ
  // (σ = sample standard deviation). The empirical 10th percentile is given too, as a
  // check on that assumption. This is weather variability only: it leaves out the
  // uncertainty of the model and of the satellite data, which a bank's P90 adds.
  const Z_P90 = 1.2816;
  function exceedance(values) {
    const n = values.length;
    if (n < 2) throw new Error('need at least two years');
    const mean = values.reduce((s, v) => s + v, 0) / n;
    const sd = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1));
    const sorted = [...values].sort((a, b) => a - b);
    const h = (n - 1) * 0.1; // linear interpolation between order statistics
    const lo = Math.floor(h);
    const p90Empirical = sorted[lo] + (h - lo) * (sorted[Math.min(lo + 1, n - 1)] - sorted[lo]);
    return { n, mean, sd, cov: sd / mean, p50: mean, p90: mean - Z_P90 * sd, p90Empirical, min: sorted[0], max: sorted[n - 1] };
  }

  // User-entered system losses in percent (input field or localStorage) as a
  // fraction for monthlyYield. Anything unusable falls back to the default;
  // values are clamped to 0–40%, beyond which the setting is surely a typo.
  const SYSTEM_LOSS_MAX_PCT = 40;
  function systemLossFraction(input) {
    const pct = typeof input === 'number' ? input : parseFloat(String(input ?? '').replace(',', '.'));
    if (!Number.isFinite(pct)) return DEFAULTS.systemLoss;
    return Math.min(Math.max(pct, 0), SYSTEM_LOSS_MAX_PCT) / 100;
  }

  // A cached climatology is reused for CLIMATOLOGY_MAX_AGE_DAYS after it was
  // fetched (the 20-year means barely move, but NASA revises its datasets).
  // Entries without a valid fetchedAt — cached before timestamps existed, or
  // from a clock that was ahead — count as stale and are refetched.
  const CLIMATOLOGY_MAX_AGE_DAYS = 180;
  function climatologyIsFresh(entry, nowMs = Date.now()) {
    if (!entry || typeof entry !== 'object' || typeof entry.fetchedAt !== 'string') return false;
    const ageMs = nowMs - Date.parse(entry.fetchedAt);
    return ageMs >= 0 && ageMs < CLIMATOLOGY_MAX_AGE_DAYS * 86400000;
  }

  const api = {
    beamTiltFactor, monthlyYield, tiltCurve, parsePowerClimatology, powerClimatologyUrl,
    powerMonthlyUrl, parsePowerMonthly, yearlyYields, exceedance, FIRST_SERIES_YEAR, horizonAt, sunPath,
    systemLossFraction, SYSTEM_LOSS_MAX_PCT, climatologyIsFresh, CLIMATOLOGY_MAX_AGE_DAYS, DEFAULTS,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SolarModel = api;
})(typeof window !== 'undefined' ? window : globalThis);
