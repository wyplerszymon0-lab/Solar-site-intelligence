// ─── Projected survey coordinates → latitude/longitude ──────
// Surveys are usually delivered in a projected system (UTM, or a national grid
// such as PL-1992 / PL-2000 / PT-TM06), all of them transverse Mercator on a
// geocentric ellipsoid. This module converts between those plane coordinates and
// lat/lon with the Krüger series to sixth order in n (Karney 2011, "Transverse
// Mercator with an accuracy of a few nanometers"), which is accurate to well under
// a millimetre within a few thousand km of the central meridian.
// Works in the browser (window.SurveyCRS) and in Node (require).

(function (root) {
  const WGS84 = { a: 6378137, f: 1 / 298.257223563 };
  const GRS80 = { a: 6378137, f: 1 / 298.257222101 };

  // Series coefficients that depend only on the ellipsoid.
  function ellipsoidTerms({ a, f }) {
    const n = f / (2 - f);
    const n2 = n * n, n3 = n2 * n, n4 = n3 * n, n5 = n4 * n, n6 = n5 * n;
    return {
      e: Math.sqrt(f * (2 - f)),
      // Rectifying radius: the meridian arc per radian of rectifying latitude.
      A: (a / (1 + n)) * (1 + n2 / 4 + n4 / 64 + n6 / 256),
      // Conformal → transverse Mercator (forward).
      alpha: [
        n / 2 - (2 * n2) / 3 + (5 * n3) / 16 + (41 * n4) / 180 - (127 * n5) / 288 + (7891 * n6) / 37800,
        (13 * n2) / 48 - (3 * n3) / 5 + (557 * n4) / 1440 + (281 * n5) / 630 - (1983433 * n6) / 1935360,
        (61 * n3) / 240 - (103 * n4) / 140 + (15061 * n5) / 26880 + (167603 * n6) / 181440,
        (49561 * n4) / 161280 - (179 * n5) / 168 + (6601661 * n6) / 7257600,
        (34729 * n5) / 80640 - (3418889 * n6) / 1995840,
        (212378941 * n6) / 319334400,
      ],
      // Transverse Mercator → conformal (inverse).
      beta: [
        n / 2 - (2 * n2) / 3 + (37 * n3) / 96 - n4 / 360 - (81 * n5) / 512 + (96199 * n6) / 604800,
        n2 / 48 + n3 / 15 - (437 * n4) / 1440 + (46 * n5) / 105 - (1118711 * n6) / 3870720,
        (17 * n3) / 480 - (37 * n4) / 840 - (209 * n5) / 4480 + (5569 * n6) / 90720,
        (4397 * n4) / 161280 - (11 * n5) / 504 - (830251 * n6) / 7257600,
        (4583 * n5) / 161280 - (108847 * n6) / 3991680,
        (20648693 * n6) / 638668800,
      ],
    };
  }

  const rad = (deg) => (deg * Math.PI) / 180;
  const deg = (r) => (r * 180) / Math.PI;

  // tan of the conformal latitude from tan of the geodetic latitude.
  function conformalTan(tau, e) {
    const sigma = Math.sinh(e * Math.atanh((e * tau) / Math.hypot(1, tau)));
    return tau * Math.hypot(1, sigma) - sigma * Math.hypot(1, tau);
  }

  // Inverse of conformalTan by Newton's method (converges in 2–3 steps).
  function geodeticTan(tauPrime, e) {
    const e2m = 1 - e * e;
    let tau = tauPrime;
    for (let i = 0; i < 10; i++) {
      const tauI = conformalTan(tau, e);
      const d = ((tauPrime - tauI) / Math.hypot(1, tauI)) * ((1 + e2m * tau * tau) / (e2m * Math.hypot(1, tau)));
      tau += d;
      if (Math.abs(d) < 1e-14) break;
    }
    return tau;
  }

  // Unscaled transverse Mercator (ξ, η) of a point λ radians from the central meridian.
  function forwardXiEta(phi, lambda, t) {
    const tauP = conformalTan(Math.tan(phi), t.e);
    const xiP = Math.atan2(tauP, Math.cos(lambda));
    const etaP = Math.asinh(Math.sin(lambda) / Math.hypot(tauP, Math.cos(lambda)));
    let xi = xiP, eta = etaP;
    t.alpha.forEach((a, j) => {
      const k = 2 * (j + 1);
      xi += a * Math.sin(k * xiP) * Math.cosh(k * etaP);
      eta += a * Math.cos(k * xiP) * Math.sinh(k * etaP);
    });
    return { xi, eta };
  }

  function makeTM({ name, ellipsoid, lat0 = 0, lon0, k0, falseEasting, falseNorthing, xIsNorthing = false, maxOffsetM = 1000000 }) {
    const t = ellipsoidTerms(ellipsoid);
    const xi0 = forwardXiEta(rad(lat0), 0, t).xi; // meridian arc to the origin latitude, over A
    return {
      name, lon0, k0, falseEasting, falseNorthing, xIsNorthing, maxOffsetM,
      toProjected(lat, lon) {
        const { xi, eta } = forwardXiEta(rad(lat), rad(lon - lon0), t);
        return {
          easting: falseEasting + k0 * t.A * eta,
          northing: falseNorthing + k0 * t.A * (xi - xi0),
        };
      },
      toLatLon(easting, northing) {
        const xi = (northing - falseNorthing) / (k0 * t.A) + xi0;
        const eta = (easting - falseEasting) / (k0 * t.A);
        let xiP = xi, etaP = eta;
        t.beta.forEach((b, j) => {
          const k = 2 * (j + 1);
          xiP -= b * Math.sin(k * xi) * Math.cosh(k * eta);
          etaP -= b * Math.cos(k * xi) * Math.sinh(k * eta);
        });
        const tauP = Math.sin(xiP) / Math.hypot(Math.sinh(etaP), Math.cos(xiP));
        const lambda = Math.atan2(Math.sinh(etaP), Math.cos(xiP));
        let lon = lon0 + deg(lambda);
        lon = ((((lon + 180) % 360) + 360) % 360) - 180;
        return { lat: deg(Math.atan(geodeticTan(tauP, t.e))), lon };
      },
    };
  }

  // id → definition. UTM is built per zone; national grids are fixed.
  //   pl1992 = EPSG:2180, pl2000:5..8 = EPSG:2176..2179, pttm06 = EPSG:3763.
  // The Polish grids follow the geodetic convention: x is northing, y is easting.
  function getCRS(id) {
    let m = /^utm:(\d{1,2})([NS])$/.exec(id || '');
    if (m && +m[1] >= 1 && +m[1] <= 60) {
      const zone = +m[1];
      return makeTM({
        name: `UTM zone ${zone}${m[2]} (WGS84)`, ellipsoid: WGS84,
        lon0: zone * 6 - 183, k0: 0.9996, falseEasting: 500000, falseNorthing: m[2] === 'S' ? 10000000 : 0,
      });
    }
    m = /^pl2000:([5-8])$/.exec(id || '');
    if (m) {
      const zone = +m[1];
      return makeTM({
        name: `PL-2000 zone ${zone} (EPSG:${2171 + zone})`, ellipsoid: GRS80,
        lon0: zone * 3, k0: 0.999923, falseEasting: zone * 1e6 + 500000, falseNorthing: 0, xIsNorthing: true,
        maxOffsetM: 300000, // 1.5° wide zones; a neighbouring zone is 1000 km off
      });
    }
    if (id === 'pl1992') {
      return makeTM({
        name: 'PL-1992 (EPSG:2180)', ellipsoid: GRS80,
        lon0: 19, k0: 0.9993, falseEasting: 500000, falseNorthing: -5300000, xIsNorthing: true,
      });
    }
    if (id === 'pttm06') {
      return makeTM({
        name: 'PT-TM06 / ETRS89 (EPSG:3763)', ellipsoid: GRS80,
        lat0: 39 + 40 / 60 + 5.73 / 3600, lon0: -(8 + 7 / 60 + 59.19 / 3600), k0: 1, falseEasting: 0, falseNorthing: 0,
      });
    }
    throw new Error(`Unknown coordinate system "${id}"`);
  }

  // Far from the central meridian (1000 km by default) a survey is in another zone, or its
  // easting and northing columns are swapped; both would put the site far away.
  // Plane coordinates of one survey point → { lat, lon }, or throws with the reason.
  function projectedToLatLon(crs, easting, northing) {
    const offset = (easting - crs.falseEasting) / crs.k0; // ≈ distance on the ground
    if (!(Math.abs(offset) <= crs.maxOffsetM)) {
      throw new Error(`easting ${easting} is ${Math.round(Math.abs(offset) / 1000)} km from the central meridian of ${crs.name}: wrong zone, or easting/northing swapped?`);
    }
    const { lat, lon } = crs.toLatLon(easting, northing);
    if (!(Math.abs(lat) <= 84.5)) throw new Error(`northing ${northing} is outside ${crs.name}`);
    return { lat, lon };
  }

  const api = { getCRS, projectedToLatLon, WGS84, GRS80 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SurveyCRS = api;
})(typeof window !== 'undefined' ? window : globalThis);
