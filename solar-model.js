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
    trackerGcr: null,        // tracker ground coverage ratio for backtracking; null = ideal tracker, no neighbours
    // Bifacial fixed rows (issue #67): null = monofacial. The rear adds bifaciality × (1 − rearLoss)
    // × its irradiance; rearLoss is pvlib's default allowance for the racking behind the modules.
    bifaciality: null,
    bifacialGcr: null,       // the rows' ground coverage ratio
    bifacialHeight: null,    // height of the rows' centre above the ground, in slant widths (must clear it)
    rearLoss: 0.02,
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
  // With `gcr` null there are no neighbouring rows, as in PVGIS: no backtracking and no
  // row shading.
  //
  // Backtracking (issue #53): rows of width w at pitch w / GCR on flat ground shade each
  // other once |cos R| < GCR, so they turn back towards flat, to the angle at which a
  // row's shadow just reaches the next row: R − sign(R)·acos(|cos R| / GCR) (Anderson &
  // Mikofski 2020; pvlib's singleaxis(), which this matches to 5·10⁻⁵°, see the tests).
  // That removes beam shading between rows, at the cost of a larger incidence angle.
  // The diffuse light the neighbouring rows block is not modelled.
  //
  // Since the module's tilt changes during the day, sky and ground light are weighted
  // moment by moment as well: the isotropic sky by (1 + cos R)/2 over the day's diffuse
  // distribution, the ground by (1 − cos R)/2 over the global one, each after glass
  // reflection at the effective incidence angles for that tilt. Returns
  //   beam:   like beamTiltFactor, plane / horizontal beam (also used for circumsolar light)
  //   sky:    the mean sky view factor, after reflection
  //   ground: the mean ground view factor, after reflection
  // Rotation from flat (radians, east positive) and cos of the incidence angle for a sun
  // vector with east component `east` and up component `up`.
  function trackerRotation(east, up, maxR, gcr) {
    let R = Math.atan2(east, up);
    if (gcr) {
      const c = Math.abs(Math.cos(R)) / gcr;
      if (c < 1) R -= Math.sign(R) * Math.acos(c); // backtracking
    }
    R = Math.max(-maxR, Math.min(maxR, R));
    return { R, cosT: east * Math.sin(R) + up * Math.cos(R) };
  }
  const maxRotation = (limit) => (limit == null ? Math.PI / 2 : Math.min(Math.max(limit, 0), 90) * DEG);

  // The tracker's rotation (degrees from flat, east positive) and incidence angle at hour
  // angle `hourAngle` (degrees) of day n, or null with the sun down. For tests and charts.
  function trackerAngles(lat, n, hourAngle, { limit = null, gcr = null } = {}) {
    const phi = lat * DEG, d = declination(n) * DEG, omega = hourAngle * DEG;
    const up = Math.cos(phi) * Math.cos(d) * Math.cos(omega) + Math.sin(phi) * Math.sin(d);
    if (up <= 0) return null;
    const { R, cosT } = trackerRotation(-Math.cos(d) * Math.sin(omega), up, maxRotation(limit), validGcr(gcr));
    return { rotation: R / DEG, incidence: Math.acos(Math.min(1, cosT)) / DEG };
  }
  function validGcr(gcr) {
    if (gcr == null) return null;
    if (!(gcr > 0 && gcr <= 1)) throw new Error('tracker GCR must be in (0, 1]');
    return gcr;
  }

  function trackerDayFactors(lat, n, b0 = 0, horizon = null, day = null, limit = null, gcr = null) {
    const phi = lat * DEG, d = declination(n) * DEG;
    const maxR = maxRotation(limit), g = validGcr(gcr);
    let onPlane = 0, onHorizontal = 0, sky = 0, ground = 0, diffuseSum = 0, globalSum = 0;
    for (const { omega, cosZ, beam, global, diffuse } of dayMoments(phi, d, day)) {
      const east = -Math.cos(d) * Math.sin(omega); // sun vector, east component; cos Z is the up one
      const { R, cosT } = trackerRotation(east, cosZ, maxR, g);
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
  // ─── Bifacial rows: the rear side (issue #67) ───
  // Fixed rows, infinitely long, on flat ground, in the 2-D cross-section across them
  // ("infinite sheds", Mikofski et al. 2019; the model of pvlib.bifacial.infinite_sheds,
  // which the tests compare with). Lengths are in units of the row's slant width L: the
  // pitch is a = 1/GCR, the row's centre is h above the ground.
  //
  // The rear of a row sees three things: the sky through the gap above, up to the top
  // edge of the row behind; the ground through the gap below, down to that row's lower
  // edge; and that row's front in between. Each gap and the row form a triangle with one
  // shared edge, so Hottel's crossed strings give the view factors in closed form:
  // (1 + a − third side) / 2, the third side √(a² ± 2a cos β + 1).
  function rearViewFactors(tilt, gcr) {
    const a = 1 / gcr, c = Math.cos(tilt * DEG);
    return {
      sky: (1 + a - Math.sqrt(a * a + 2 * a * c + 1)) / 2,
      ground: (1 + a - Math.sqrt(a * a - 2 * a * c + 1)) / 2,
    };
  }

  // The sky seen from the ground between two rows, averaged over the pitch: from each
  // point, the rows hide angular intervals of the sky (to their two edges), and the view
  // factor of the rest is the sum of ½(cos θ₁ − cos θ₂) over the open intervals. Rows are
  // counted to 200 pitches either side, where they are well under 1° high. Averaged over the
  // pitch of infinite rows, this does not depend on the height (pvlib's exact integral gives
  // the same to 10⁻¹²): the height only has to clear the ground. The rows cut off beyond 200
  // pitches make it drift by up to 5·10⁻⁵ for rows 4 slant widths up.
  const groundSkyCache = new Map();
  function groundSkyView(tilt, gcr, height) {
    const key = `${tilt}|${gcr}|${height}`;
    if (groundSkyCache.has(key)) return groundSkyCache.get(key);
    const a = 1 / gcr, cx = Math.cos(tilt * DEG) / 2, sy = Math.sin(tilt * DEG) / 2;
    if (!(height > sy)) throw new Error('the rows must clear the ground');
    const ROWS = 200, POINTS = 400;
    let total = 0;
    for (let i = 0; i < POINTS; i++) {
      const x = (i + 0.5) / POINTS * a;
      const hidden = [];
      for (let k = -ROWS; k <= ROWS; k++) {
        const dx = k * a - x;
        const t1 = Math.atan2(height + sy, dx - cx), t2 = Math.atan2(height - sy, dx + cx);
        hidden.push([Math.min(t1, t2), Math.max(t1, t2)]);
      }
      hidden.sort((p, q) => p[0] - q[0]);
      let seen = 0, from = 0; // open sky from angle `from` (0 = horizon on the +x side)
      for (const [lo, hi] of hidden) {
        if (lo > from) seen += (Math.cos(from) - Math.cos(lo)) / 2;
        from = Math.max(from, hi);
      }
      seen += (Math.cos(from) - Math.cos(Math.PI)) / 2;
      total += seen;
    }
    const v = total / POINTS;
    groundSkyCache.set(key, v);
    return v;
  }

  // Cosine of the beam's incidence angle on a plane of tilt beta, azimuth gamma (from
  // south, west positive), at hour angle omega (Duffie & Beckman eq. 1.6.2).
  const cosIncidence = (phi, d, beta, gamma, omega) =>
    Math.sin(d) * Math.sin(phi) * Math.cos(beta) -
    Math.sin(d) * Math.cos(phi) * Math.sin(beta) * Math.cos(gamma) +
    Math.cos(d) * Math.cos(phi) * Math.cos(beta) * Math.cos(omega) +
    Math.cos(d) * Math.sin(phi) * Math.sin(beta) * Math.cos(gamma) * Math.cos(omega) +
    Math.cos(d) * Math.sin(beta) * Math.sin(gamma) * Math.sin(omega);

  // Irradiation on the rear of fixed rows over the mean day of month day n, kWh/m², from
  // the day's H and Hd spread over the day as for the front side (dayMoments). With the
  // Hay–Davies sky, the circumsolar share A of the diffuse light comes from the sun's
  // direction, so it counts as beam (as pvlib does); the rest is isotropic. Moment by moment:
  //  - sky: the isotropic diffuse light times the rear's sky view;
  //  - ground: the light on the ground between the rows times the albedo and the rear's
  //    ground view. The ground gets beam on its sunlit share (1 − the rows' shadow,
  //    GCR·|cos β + sin β tan φ| of the pitch, φ the sun's angle from the zenith across
  //    the rows) and diffuse light by its own sky view (groundSkyView). Like pvlib, its
  //    brightness is averaged over the pitch, and light reflected by other rows is left out;
  //  - beam: when the sun is behind the rows (early and late in summer), on the part of
  //    the rear the row behind does not shade.
  // No glass reflection loss on the rear (pvlib's default too). geometry: {gcr, height}.
  function rearDayIrradiation(lat, tilt, compassAz, n, day, { gcr, height }, albedo, skyA = 0, horizon = null) {
    const phi = lat * DEG, beta = tilt * DEG, gamma = (compassAz - 180) * DEG, d = declination(n) * DEG;
    const view = rearViewFactors(tilt, gcr), gndSky = groundSkyView(tilt, gcr, height);
    const moments = dayMoments(phi, d, day);
    const beamWeight = moments.reduce((s, m) => s + m.beam, 0);
    const beamDay = Math.max(0, day.H - day.Hd);
    let sky = 0, ground = 0, beam = 0;
    for (const m of moments) {
      const Dh = day.Hd * m.diffuse;
      const Bh = beamWeight > 0 ? beamDay * m.beam / beamWeight : 0;
      const circumsolar = skyA * Dh;
      const blocked = horizon && behindSkyline(horizon, phi, d, m.omega, m.cosZ);
      const B = blocked ? 0 : Bh + circumsolar; // beam-like light on the horizontal
      const iso = Dh - circumsolar;
      const tanZ = Math.sqrt(Math.max(0, 1 - m.cosZ * m.cosZ)) / m.cosZ;
      const tanPhi = Math.cos(sunAzimuthFromSouth(phi, d, m.omega) - gamma) * tanZ; // + towards the front
      const sunlit = Math.max(0, 1 - gcr * Math.abs(Math.cos(beta) + Math.sin(beta) * tanPhi));
      sky += iso * view.sky;
      ground += albedo * (sunlit * B + gndSky * iso) * view.ground;
      const cosRear = -cosIncidence(phi, d, beta, gamma, m.omega);
      if (cosRear > 0 && B > 0) {
        const x = gcr * (-Math.sin(beta) * tanPhi - Math.cos(beta)); // shadow of the row behind
        const shaded = x > 1 ? 1 - 1 / x : 0;
        beam += B / m.cosZ * cosRear * (1 - shaded);
      }
    }
    return { total: sky + ground + beam, sky, ground, beam };
  }

  function monthlyYield(climatology, lat, tilt, compassAz, options = {}) {
    const o = { ...DEFAULTS, ...options };
    if (!SKY_MODELS.includes(o.skyModel)) throw new Error(`unknown sky model: ${o.skyModel}`);
    if (!BEAM_PROFILES.includes(o.beamProfile)) throw new Error(`unknown beam profile: ${o.beamProfile}`);
    if (!MOUNTINGS.includes(o.mounting)) throw new Error(`unknown mounting: ${o.mounting}`);
    const tracking = o.mounting === 'single-axis';
    if (!(o.groundAlbedo >= 0 && o.groundAlbedo <= 1)) throw new Error('ground albedo must be in [0, 1]');
    const bifacial = o.bifaciality != null;
    if (bifacial) {
      if (tracking) throw new Error('bifacial modules are modelled on fixed rows only');
      if (!(o.bifaciality > 0 && o.bifaciality <= 1)) throw new Error('bifaciality must be in (0, 1]');
      validGcr(o.bifacialGcr);
      if (!(o.rearLoss >= 0 && o.rearLoss < 1)) throw new Error('rear loss must be in [0, 1)');
    }
    const cosB = Math.cos(tilt * DEG);
    const kSky = (o.iamB0 > 0 ? incidenceModifier(Math.cos(skyIncidenceDeg(tilt) * DEG), o.iamB0) : 1);
    const kGround = o.iamB0 > 0 ? incidenceModifier(Math.cos(groundIncidenceDeg(tilt) * DEG), o.iamB0) : 1;
    const months = MEAN_DAY.map((n, m) => {
      const H = climatology.ghi[m];
      const Hd = Math.min(climatology.diffuse[m], H);
      const day = { H, Hd, profile: o.beamProfile };
      // Beam factor and the sky and ground view factors after glass reflection.
      const f = tracking
        ? trackerDayFactors(lat, n, o.iamB0, o.horizon, day, o.trackerLimit, o.trackerGcr)
        : { beam: beamTiltFactor(lat, tilt, compassAz, n, o.iamB0, o.horizon, day),
            sky: (1 + cosB) / 2 * kSky, ground: (1 - cosB) / 2 * kGround };
      const Rb = f.beam;
      const H0 = extraterrestrialDaily(lat, n);
      const A = o.skyModel === 'hay-davies' && H0 > 0 ? Math.min(1, (H - Hd) / H0) : 0;
      const frontDaily = (H - Hd) * Rb +
        Hd * (A * Rb + (1 - A) * f.sky) +
        H * o.groundAlbedo * f.ground;
      const rearDaily = bifacial
        ? rearDayIrradiation(lat, tilt, compassAz, n, day, { gcr: o.bifacialGcr, height: o.bifacialHeight },
          o.groundAlbedo, A, o.horizon).total
        : 0;
      const poaDaily = frontDaily + (bifacial ? o.bifaciality * (1 - o.rearLoss) * rearDaily : 0);
      const cellTemp = climatology.temp[m] + o.cellTempRise;
      const tempFactor = 1 + o.tempCoeff * (cellTemp - 25);
      const poa = poaDaily * DAYS_IN_MONTH[m];
      return { poa, rear: rearDaily * DAYS_IN_MONTH[m], yield: poa * (1 - o.systemLoss) * tempFactor };
    });
    const sum = (k) => months.reduce((s, x) => s + x[k], 0);
    return {
      monthly: months.map(x => x.yield),
      annual: sum('yield'),
      poaAnnual: sum('poa'),
      rearAnnual: sum('rear'), // irradiation on the rear (kWh/m²), before bifaciality; 0 if monofacial
    };
  }

  // ─── Hourly data (issue #57) ───
  const MODULE_TEMPS = ['fixed-rise', 'faiman'];
  const POWER_MODELS = ['linear', 'huld'];
  // Huld et al. (2011) c-Si coefficients k1–k6 as on PVGIS 5's methods page (pvlib 'pvgis5').
  const HULD_CSI = [-0.017237, -0.040465, -0.004702, 0.000149, 0.000170, 0.000005];

  // Relative module efficiency at in-plane irradiance G (W/m²) and module temperature Tm (°C).
  function huldEfficiency(G, Tm) {
    if (!(G > 0)) return 0;
    const [k1, k2, k3, k4, k5, k6] = HULD_CSI;
    const l = Math.log(G / 1000), t = Tm - 25;
    return 1 + k1 * l + k2 * l * l + k3 * t + k4 * t * l + k5 * t * l * l + k6 * t * t;
  }

  // Sun position for latitude/longitude at a UTC time (ms): the NOAA general solar position
  // (Spencer's series for declination and the equation of time). Returns the sun vector's
  // east, north and up components and the day of the year.
  function sunPosition(lat, lon, utcMs) {
    const t = new Date(utcMs);
    const year = t.getUTCFullYear();
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    const doy = Math.floor((utcMs - Date.UTC(year, 0, 1)) / 86400000) + 1;
    const hour = t.getUTCHours() + t.getUTCMinutes() / 60 + t.getUTCSeconds() / 3600;
    const g = 2 * Math.PI / (leap ? 366 : 365) * (doy - 1 + (hour - 12) / 24);
    const eotMin = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) -
      0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
    const d = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) +
      0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
    const omega = ((hour * 60 + eotMin + 4 * lon) / 4 - 180) * DEG; // hour angle
    const phi = lat * DEG;
    return {
      up: Math.sin(phi) * Math.sin(d) + Math.cos(phi) * Math.cos(d) * Math.cos(omega),
      east: -Math.cos(d) * Math.sin(omega),
      north: Math.cos(phi) * Math.sin(d) - Math.sin(phi) * Math.cos(d) * Math.cos(omega),
      dayOfYear: doy,
    };
  }

  // NASA POWER hourly JSON (time-standard=UTC) as arrays from the first hour:
  // { startMs, ghi[], diffuse[], dni[] (Wh/m² in the hour), temp[] (°C) }, null where missing.
  // A value belongs to the hour starting at its stamp: NASA's documentation does not say,
  // but its clear-sky GHI is centred 28 min after the stamp's solar time (issue #57).
  function parsePowerHourly(json) {
    const p = json?.properties?.parameter;
    const keys = Object.keys(p?.ALLSKY_SFC_SW_DWN ?? {}).sort();
    if (!keys.length) throw new Error('NASA POWER returned no hourly data for this location');
    const k0 = keys[0];
    const col = (name) => keys.map(k => { const v = p?.[name]?.[k]; return typeof v === 'number' && v > -900 ? v : null; });
    return {
      startMs: Date.UTC(+k0.slice(0, 4), +k0.slice(4, 6) - 1, +k0.slice(6, 8), +k0.slice(8, 10)),
      ghi: col('ALLSKY_SFC_SW_DWN'), diffuse: col('ALLSKY_SFC_SW_DIFF'), dni: col('ALLSKY_SFC_SW_DNI'), temp: col('T2M'),
    };
  }

  // Yield from hourly data: the same physics as monthlyYield (Hay–Davies or isotropic sky,
  // ASHRAE reflection, the same temperature rule and losses, horizon, fixed or tracking
  // mounting with backtracking), applied hour by hour with the sun at the middle of each
  // hour, so the beam at low sun and any morning/afternoon asymmetry come from the data
  // instead of a distribution over the mean day. The circumsolar beam factor
  // cos θ / cos Z is capped at cos Z ≥ 0.087 (5°), the usual guard of hourly Hay–Davies.
  // hours: parsePowerHourly()'s shape; values in the hour (Wh/m²), temp in °C.
  // Returns kWh per kWp by calendar month and for the whole series.
  // Options for the module (issue #61), study only:
  //  - moduleTemp 'faiman': module temperature T + G/(U0 + U1·wind) from the hour's in-plane
  //    irradiance (W/m²) and wind (hours.wind, m/s), with PVGIS's free-standing c-Si
  //    coefficients by default, instead of the fixed T + cellTempRise;
  //  - power 'huld': the Huld et al. (2011) relative efficiency with PVGIS 5's c-Si
  //    coefficients, which also covers the loss at low irradiance, instead of tempCoeff.
  function hourlyYield(hours, lat, lon, tilt, compassAz, options = {}) {
    const o = { ...DEFAULTS, moduleTemp: 'fixed-rise', faimanU0: 26.9, faimanU1: 6.2, power: 'linear', ...options };
    if (!SKY_MODELS.includes(o.skyModel)) throw new Error(`unknown sky model: ${o.skyModel}`);
    if (!MOUNTINGS.includes(o.mounting)) throw new Error(`unknown mounting: ${o.mounting}`);
    if (!MODULE_TEMPS.includes(o.moduleTemp)) throw new Error(`unknown module temperature model: ${o.moduleTemp}`);
    if (!POWER_MODELS.includes(o.power)) throw new Error(`unknown power model: ${o.power}`);
    const faiman = o.moduleTemp === 'faiman';
    if (faiman && !Array.isArray(hours.wind)) throw new Error('the Faiman module temperature needs hours.wind');
    const tracking = o.mounting === 'single-axis';
    const maxR = maxRotation(o.trackerLimit), gcr = validGcr(o.trackerGcr);
    const k = (deg) => (o.iamB0 > 0 ? incidenceModifier(Math.cos(deg * DEG), o.iamB0) : 1);
    const fixedN = {
      east: Math.sin(tilt * DEG) * Math.sin(compassAz * DEG),
      north: Math.sin(tilt * DEG) * Math.cos(compassAz * DEG),
      up: Math.cos(tilt * DEG),
    };
    const fixedK = { sky: k(skyIncidenceDeg(tilt)), ground: k(groundIncidenceDeg(tilt)) };
    const monthly = new Array(12).fill(0);
    let poaTotal = 0, used = 0;
    for (let i = 0; i < hours.ghi.length; i++) {
      const G = hours.ghi[i], Dh = hours.diffuse[i], B = hours.dni[i], T = hours.temp[i];
      const W = faiman ? hours.wind[i] : 0;
      if (G == null || Dh == null || B == null || T == null || W == null || G <= 0) continue;
      used++;
      const startMs = hours.startMs + i * 3600000;
      const s = sunPosition(lat, lon, startMs + 1800000);
      let n = fixedN, kk = fixedK, beta = tilt;
      if (tracking) {
        const { R } = trackerRotation(s.east, Math.max(s.up, 1e-9), maxR, gcr);
        n = { east: Math.sin(R), north: 0, up: Math.cos(R) };
        beta = Math.abs(R) / DEG;
        kk = { sky: k(skyIncidenceDeg(beta)), ground: k(groundIncidenceDeg(beta)) };
      }
      const cosT = s.east * n.east + s.north * n.north + s.up * n.up;
      const sunUp = s.up > 0;
      let shaded = false;
      if (sunUp && o.horizon) {
        const az = Math.atan2(s.east, s.north) / DEG; // compass bearing
        shaded = Math.asin(Math.min(1, s.up)) / DEG < horizonAt(o.horizon, (az + 360) % 360);
      }
      const reflect = cosT > 0 ? (o.iamB0 > 0 ? incidenceModifier(cosT, o.iamB0) : 1) : 0;
      const E0n = SOLAR_CONSTANT * 1000 * (1 + 0.033 * Math.cos(2 * Math.PI * s.dayOfYear / 365));
      const A = o.skyModel === 'hay-davies' && sunUp ? Math.min(1, B / E0n) : 0;
      const beamOn = sunUp && !shaded ? B * Math.max(0, cosT) * reflect : 0;
      const circumsolar = sunUp && !shaded ? Dh * A * Math.max(0, cosT) / Math.max(s.up, 0.087) * reflect : 0;
      const poa = beamOn + circumsolar +
        Dh * (1 - A) * (1 + n.up) / 2 * kk.sky +
        G * o.groundAlbedo * (1 - n.up) / 2 * kk.ground;
      const Tm = faiman ? T + poa / (o.faimanU0 + o.faimanU1 * W) : T + o.cellTempRise;
      const efficiency = o.power === 'huld' ? huldEfficiency(poa, Tm) : 1 + o.tempCoeff * (Tm - 25);
      monthly[new Date(startMs).getUTCMonth()] += poa / 1000 * (1 - o.systemLoss) * efficiency;
      poaTotal += poa / 1000;
    }
    return { monthly, annual: monthly.reduce((a, b) => a + b, 0), poaAnnual: poaTotal, hoursUsed: used };
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
    extraterrestrialDaily, SKY_MODELS, BEAM_PROFILES, MOUNTINGS, trackerDayFactors, trackerAngles, dayMoments,
    sunPosition, parsePowerHourly, hourlyYield, huldEfficiency,
    rearViewFactors, groundSkyView, rearDayIrradiation, MEAN_DAY,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SolarModel = api;
})(typeof window !== 'undefined' ? window : globalThis);
