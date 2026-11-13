// ─── PV yield model from satellite irradiance ────────────────
// Monthly energy yield of a fixed PV array from NASA POWER climatology
// (20-year monthly means of global and diffuse horizontal irradiance and
// air temperature). Irradiance is transposed to the tilted plane with the
// Hay–Davies anisotropic sky by default, or the isotropic sky (Liu & Jordan;
// Duffie & Beckman, "Solar Engineering of Thermal Processes", §2.16, §2.19). The beam tilt factor R_b is integrated over the
// day of each month's recommended average date, which handles any tilt,
// azimuth and hemisphere with one formula, with the beam spread over the day by the
// Collares-Pereira & Rabl distribution (see beamTiltFactor). Reflection losses at the module
// glass use the ASHRAE incidence-angle modifier. A single-axis tracker (horizontal
// north–south axis) is the other mounting (see trackerDayFactors). Validated against PVGIS in
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
    skyModel: 'hay-davies',  // diffuse light: 'isotropic' or 'hay-davies' (see monthlyYield)
    beamProfile: 'collares-pereira-rabl', // beam over the day: or 'constant-clearness' (see beamTiltFactor)
    mounting: 'fixed',       // or 'single-axis': horizontal north–south tracker; tilt and azimuth are then ignored
    trackerLimit: null,      // largest tracker rotation from flat, degrees; null = none, as in PVGIS
  };
  const SKY_MODELS = ['isotropic', 'hay-davies'];
  const BEAM_PROFILES = ['constant-clearness', 'collares-pereira-rabl'];
  const MOUNTINGS = ['fixed', 'single-axis'];
  const SOLAR_CONSTANT = 1.367; // kW/m² (Duffie & Beckman §1.2)

  function declination(n) {
    return 23.45 * Math.sin(2 * Math.PI * (284 + n) / 365);
  }

  // Daily extraterrestrial irradiation on a horizontal surface, kWh/m²/day
  // (Duffie & Beckman eq. 1.10.3). 0 during polar night.
  function extraterrestrialDaily(lat, n) {
    const phi = lat * DEG, d = declination(n) * DEG;
    const cosWs = Math.max(-1, Math.min(1, -Math.tan(phi) * Math.tan(d)));
    const ws = Math.acos(cosWs);
    const h0 = (24 / Math.PI) * SOLAR_CONSTANT * (1 + 0.033 * Math.cos(2 * Math.PI * n / 365)) *
      (Math.cos(phi) * Math.cos(d) * Math.sin(ws) + ws * Math.sin(phi) * Math.sin(d));
    return Math.max(0, h0);
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
  //
  // How the day's beam is spread over the hours (issue #41). With no `day`, or with
  // `day.profile` 'constant-clearness', each moment is weighted by cos Z, as if the sky
  // were as clear at sunrise as at noon. It is not: through more air mass, the beam
  // fades towards the horizon (NASA's hourly clearness index at Lisbon: 0.66 within an
  // hour of noon, 0.45 at 5–6 h), and constant clearness gives the low-sun hours, which
  // east- and west-facing arrays depend on, too much beam. 'collares-pereira-rabl'
  // weights them by the hourly beam of the mean day instead: the Collares-Pereira & Rabl
  // (1979) distribution of the global irradiation H minus the Liu & Jordan (1960) one
  // of the diffuse Hd (Duffie & Beckman eqs. 2.13.1–2.13.2), floored at zero.
  // day = { H, Hd, profile } in any one unit; only their ratio matters.
  // The moments of a day (every 0.5° of hour angle while the sun is up) with the share of
  // the day's global and diffuse irradiation that falls in each, and the horizontal beam,
  // up to a constant factor. Constant clearness weights every share by cos Z; the
  // Collares-Pereira & Rabl and Liu & Jordan distributions are described at beamTiltFactor.
  // Shared by the fixed and the tracking mounting.
  function dayMoments(phi, d, day) {
    const cosZAt = (omega) => Math.cos(phi) * Math.cos(d) * Math.cos(omega) + Math.sin(phi) * Math.sin(d);
    const shaped = day && day.profile === 'collares-pereira-rabl' && day.H > day.Hd;
    const ws = Math.acos(Math.max(-1, Math.min(1, -Math.tan(phi) * Math.tan(d)))); // sunset hour angle
    const a = 0.409 + 0.5016 * Math.sin(ws - Math.PI / 3);
    const b = 0.6609 - 0.4767 * Math.sin(ws - Math.PI / 3);
    const moments = [];
    let globalNorm = 0, diffuseNorm = 0;
    for (let w = -180; w < 180; w += 0.5) {
      const omega = w * DEG, cosZ = cosZAt(omega);
      if (cosZ <= 0) continue; // sun below the horizon
      const g = shaped ? (a + b * Math.cos(omega)) * cosZ : cosZ;
      moments.push({ omega, cosZ, g });
      globalNorm += g; diffuseNorm += cosZ;
    }
    for (const m of moments) {
      m.global = m.g / globalNorm;     // share of the day's global irradiation H
      m.diffuse = m.cosZ / diffuseNorm; // share of the day's diffuse irradiation Hd
      m.beam = shaped ? Math.max(0, m.global * day.H - m.diffuse * day.Hd) : m.cosZ;
    }
    return moments;
  }

  // Sun azimuth from south, west positive, at hour angle omega (radians).
  const sunAzimuthFromSouth = (phi, d, omega) =>
    Math.atan2(Math.sin(omega) * Math.cos(d), Math.sin(phi) * Math.cos(d) * Math.cos(omega) - Math.cos(phi) * Math.sin(d));

  function beamTiltFactor(lat, tilt, compassAz, n, b0 = 0, horizon = null, day = null) {
    const phi = lat * DEG, beta = tilt * DEG;
    const gamma = (compassAz - 180) * DEG; // surface azimuth from south, west positive
    const d = declination(n) * DEG;
    let onPlane = 0, onHorizontal = 0;
    for (const { omega, cosZ, beam } of dayMoments(phi, d, day)) {
      const cosT =
        Math.sin(d) * Math.sin(phi) * Math.cos(beta) -
        Math.sin(d) * Math.cos(phi) * Math.sin(beta) * Math.cos(gamma) +
        Math.cos(d) * Math.cos(phi) * Math.cos(beta) * Math.cos(omega) +
        Math.cos(d) * Math.sin(phi) * Math.sin(beta) * Math.cos(gamma) * Math.cos(omega) +
        Math.cos(d) * Math.sin(beta) * Math.sin(gamma) * Math.sin(omega);
      onHorizontal += beam;
      if (horizon && behindSkyline(horizon, phi, d, omega, cosZ)) continue;
      onPlane += (beam / cosZ) * Math.max(0, cosT) * (b0 > 0 ? incidenceModifier(cosT, b0) : 1);
    }
    return onHorizontal > 0 ? onPlane / onHorizontal : 0;
  }

  const behindSkyline = (horizon, phi, d, omega, cosZ) =>
    Math.asin(Math.min(1, cosZ)) / DEG < horizonAt(horizon, sunAzimuthFromSouth(phi, d, omega) / DEG + 180);

  // ─── Single-axis tracker (issue #49) ───
  // Rows on a horizontal north–south axis turn the modules from east (morning) to west
  // (evening). The rotation that brings the module normal closest to the sun is
  // R = atan(sun's east component / its up component), the true-tracking angle of
  // Lorenzo et al. and of pvlib's singleaxis(), and PVGIS's assumption ("always minimizes
  // the angle between the normal of the module plane and the direction to the sun").
  // `limit` caps |R| (real trackers stop at ±50–60°); null tracks freely, as PVGIS does.
  // No backtracking and no shading between rows, as in PVGIS.
  //
  // Since the module's tilt changes during the day, sky and ground light are weighted
  // moment by moment as well: the isotropic sky by (1 + cos R)/2 over the day's diffuse
  // distribution, the ground by (1 − cos R)/2 over the global one, each after glass
  // reflection at the effective incidence angles for that tilt. Returns
  //   beam:   like beamTiltFactor, plane / horizontal beam (also used for circumsolar light)
  //   sky:    the mean sky view factor, after reflection
  //   ground: the mean ground view factor, after reflection
  function trackerDayFactors(lat, n, b0 = 0, horizon = null, day = null, limit = null) {
    const phi = lat * DEG, d = declination(n) * DEG;
    const maxR = limit == null ? Math.PI / 2 : Math.min(Math.max(limit, 0), 90) * DEG;
    let onPlane = 0, onHorizontal = 0, sky = 0, ground = 0, diffuseSum = 0, globalSum = 0;
    for (const { omega, cosZ, beam, global, diffuse } of dayMoments(phi, d, day)) {
      const east = -Math.cos(d) * Math.sin(omega); // sun vector, east component; cos Z is the up one
      const R = Math.max(-maxR, Math.min(maxR, Math.atan2(east, cosZ)));
      const cosT = east * Math.sin(R) + cosZ * Math.cos(R);
      const tilt = Math.abs(R) / DEG;
      const kSky = b0 > 0 ? incidenceModifier(Math.cos(skyIncidenceDeg(tilt) * DEG), b0) : 1;
      const kGround = b0 > 0 ? incidenceModifier(Math.cos(groundIncidenceDeg(tilt) * DEG), b0) : 1;
      sky += diffuse * (1 + Math.cos(R)) / 2 * kSky; diffuseSum += diffuse;
      ground += global * (1 - Math.cos(R)) / 2 * kGround; globalSum += global;
      onHorizontal += beam;
      if (horizon && behindSkyline(horizon, phi, d, omega, cosZ)) continue;
      onPlane += (beam / cosZ) * Math.max(0, cosT) * (b0 > 0 ? incidenceModifier(cosT, b0) : 1);
    }
    return {
      beam: onHorizontal > 0 ? onPlane / onHorizontal : 0,
      sky: diffuseSum > 0 ? sky / diffuseSum : 1,
      ground: globalSum > 0 ? ground / globalSum : 0,
    };
  }

  // climatology: { ghi[12], diffuse[12] } in kWh/m²/day and { temp[12] } in °C.
  // Returns monthly and annual yield in kWh per kWp, plus plane-of-array irradiation.
  //
  // Sky models for diffuse light:
  //  - 'isotropic' (Liu & Jordan): spread evenly over the sky dome.
  //  - 'hay-davies' (Hay & Davies 1980; Duffie & Beckman §2.16): a share A of it, the
  //    anisotropy index A = beam / extraterrestrial, comes from around the sun and is
  //    treated like beam (same beam factor, so also glass reflection and horizon);
  //    the rest is isotropic. Clear skies give a large A, overcast skies A ≈ 0.
  //
  // options.mounting 'single-axis' models a horizontal north–south tracker instead
  // (trackerDayFactors); tilt and compassAz are then ignored.
  function monthlyYield(climatology, lat, tilt, compassAz, options = {}) {
    const o = { ...DEFAULTS, ...options };
    if (!SKY_MODELS.includes(o.skyModel)) throw new Error(`unknown sky model: ${o.skyModel}`);
    if (!BEAM_PROFILES.includes(o.beamProfile)) throw new Error(`unknown beam profile: ${o.beamProfile}`);
    if (!MOUNTINGS.includes(o.mounting)) throw new Error(`unknown mounting: ${o.mounting}`);
    const tracking = o.mounting === 'single-axis';
    const cosB = Math.cos(tilt * DEG);
    const kSky = (o.iamB0 > 0 ? incidenceModifier(Math.cos(skyIncidenceDeg(tilt) * DEG), o.iamB0) : 1);
    const kGround = o.iamB0 > 0 ? incidenceModifier(Math.cos(groundIncidenceDeg(tilt) * DEG), o.iamB0) : 1;
    const months = MEAN_DAY.map((n, m) => {
      const H = climatology.ghi[m];
      const Hd = Math.min(climatology.diffuse[m], H);
      const day = { H, Hd, profile: o.beamProfile };
      // Beam factor and the sky and ground view factors after glass reflection.
      const f = tracking
        ? trackerDayFactors(lat, n, o.iamB0, o.horizon, day, o.trackerLimit)
        : { beam: beamTiltFactor(lat, tilt, compassAz, n, o.iamB0, o.horizon, day),
            sky: (1 + cosB) / 2 * kSky, ground: (1 - cosB) / 2 * kGround };
      const Rb = f.beam;
      const H0 = extraterrestrialDaily(lat, n);
      const A = o.skyModel === 'hay-davies' && H0 > 0 ? Math.min(1, (H - Hd) / H0) : 0;
      const poaDaily = (H - Hd) * Rb +
        Hd * (A * Rb + (1 - A) * f.sky) +
        H * o.groundAlbedo * f.ground;
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

  // The monthly climatology of a series: the mean of each month over its complete years,
  // in the shape monthlyYield takes, with the years it covers. NASA's own climatology
  // carries a period label that need not match its values (issue #37); this one covers
  // exactly the years given, the same ones P50/P90 use. `years` can be below
  // last − first + 1 when a year in between was incomplete and left out.
  function climatologyFromSeries(series) {
    if (!Array.isArray(series) || series.length < MIN_SERIES_YEARS) {
      throw new Error(`need at least ${MIN_SERIES_YEARS} complete years`);
    }
    const monthMean = (field) => MONTH_KEYS.map((_, m) => series.reduce((s, y) => s + y[field][m], 0) / series.length);
    const years = series.map(y => y.year);
    return {
      ghi: monthMean('ghi'), diffuse: monthMean('diffuse'), temp: monthMean('temp'),
      period: { first: Math.min(...years), last: Math.max(...years), years: series.length },
    };
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

  // Uncertainty of the yield estimate itself, model and satellite irradiance together, as a
  // fraction of the yield (issue #43). It is the RMS error of this model against PVGIS 5.3
  // at the seven independent equator-facing validation sites: 3.8% when measured (2.3%
  // without Oslo, where NASA's irradiance is 2.5% above PVGIS's). A test recomputes it.
  // PVGIS is a reference, not the truth, so its own error is part of this number; seven
  // sites are a small sample; and using it elsewhere is an extrapolation from Europe,
  // North Africa, South Africa and Australia.
  const ESTIMATE_UNCERTAINTY = 0.038;
  // The same for the single-axis tracker (issue #49): its RMS error against PVGIS 5.3's
  // inclined-axis tracker at 0° slope at the same seven sites, 5.6% when measured (3.9%
  // without Oslo). Larger than for fixed arrays, because a tracker depends most on the
  // low-sun hours, where the model's beam is least certain. A test recomputes it.
  const TRACKER_ESTIMATE_UNCERTAINTY = 0.056;

  // P90 over an N-year horizon, with the uncertainty of the estimate: the weather's
  // year-to-year σ shrinks as σ/√N when years are averaged, an error in the estimate
  // does not, and the two are independent, so they add in quadrature. years = 1 is one
  // bad year; years = 10 is the long-term P90 of energy assessments, the average of ten.
  // e is exceedance()'s result. Leaves out degradation, soiling and availability.
  function exceedanceWithEstimate(e, years = 1, estimate = ESTIMATE_UNCERTAINTY) {
    if (!(years >= 1)) throw new Error('years must be at least 1');
    if (!(estimate >= 0)) throw new Error('estimate uncertainty must not be negative');
    const sigmaWeather = e.sd / Math.sqrt(years);
    const sigmaEstimate = estimate * e.mean;
    const sigma = Math.hypot(sigmaWeather, sigmaEstimate);
    return { years, sigma, sigmaWeather, sigmaEstimate, p50: e.mean, p90: e.mean - Z_P90 * sigma };
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
    powerMonthlyUrl, parsePowerMonthly, climatologyFromSeries, yearlyYields, exceedance,
    exceedanceWithEstimate, ESTIMATE_UNCERTAINTY, TRACKER_ESTIMATE_UNCERTAINTY, FIRST_SERIES_YEAR, horizonAt, sunPath,
    systemLossFraction, SYSTEM_LOSS_MAX_PCT, climatologyIsFresh, CLIMATOLOGY_MAX_AGE_DAYS, DEFAULTS,
    extraterrestrialDaily, SKY_MODELS, BEAM_PROFILES, MOUNTINGS, trackerDayFactors, dayMoments,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SolarModel = api;
})(typeof window !== 'undefined' ? window : globalThis);
