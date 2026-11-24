// ─── Site geometry and survey heuristics ────────────────────
// Pure functions over survey points ({ lat, lon, elevation, slope, azimuth }):
// compass maths, per-point rating, shading and outlier flags, site boundary.
// Works in the browser (window.SiteGeometry) and in Node (require).

(function (root) {
  const DEG = Math.PI / 180;
  const SHADING_SCAN_CAP = 1000; // skip the O(n²) shading heuristic above this many points

  // Northern hemisphere ⇒ panels face true south (180°); southern hemisphere ⇒ true north (0°/360°).
  function optimalAzimuth(lat) {
    return lat >= 0 ? 180 : 0;
  }

  // Circular distance between two compass bearings (handles wrap-around at 0°/360°).
  function azimuthDiff(az, target) {
    const d = Math.abs(az - target);
    return Math.min(d, 360 - d);
  }

  // Circular mean of compass bearings. An arithmetic mean breaks across north:
  // 350° and 10° average to 180° (due south) instead of 0°, which inverted the
  // result for north-facing sites in the southern hemisphere.
  function circularMeanDeg(bearings) {
    if (!bearings.length) return null;
    let x = 0, y = 0;
    bearings.forEach(b => { x += Math.cos(b * DEG); y += Math.sin(b * DEG); });
    if (Math.hypot(x, y) < 1e-9 * bearings.length) return null; // directions cancel out
    return (Math.atan2(y, x) / DEG + 360) % 360;
  }

  function solarRating(lat, slope, azimuth) {
    const az = azimuth ?? optimalAzimuth(lat);
    const sl = slope ?? 0;
    const azScore = 1 - azimuthDiff(az, optimalAzimuth(lat)) / 90;
    const slScore = sl >= 10 && sl <= 35 ? 1 : sl < 10 ? sl / 10 : Math.max(0, 1 - (sl - 35) / 30);
    const score = azScore * 0.6 + slScore * 0.4;
    if (score > 0.7) return 'good';
    if (score > 0.4) return 'mid';
    return 'bad';
  }

  function haversineM(p1, p2) {
    const R = 6371000;
    const phi1 = p1.lat * DEG, phi2 = p2.lat * DEG;
    const dPhi = (p2.lat - p1.lat) * DEG;
    const dLambda = (p2.lon - p1.lon) * DEG;
    const a = Math.sin(dPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  function bearingDeg(p1, p2) {
    const phi1 = p1.lat * DEG, phi2 = p2.lat * DEG;
    const dLambda = (p2.lon - p1.lon) * DEG;
    const y = Math.sin(dLambda) * Math.cos(phi2);
    const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
    return (Math.atan2(y, x) / DEG + 360) % 360;
  }

  // Heuristic only: flags a point if a notably higher neighbor sits within
  // 30 m, roughly on the sun side (equatorward). Not a rigorous shading study.
  function detectShading(points, lat) {
    if (points.length > SHADING_SCAN_CAP) return points.map(() => false);
    const sunSideAz = optimalAzimuth(lat);
    const RADIUS_M = 30, MIN_HEIGHT_DIFF = 3;
    return points.map(p => {
      if (p.elevation == null) return false;
      return points.some(q => {
        if (q === p || q.elevation == null) return false;
        const dist = haversineM(p, q);
        if (dist > RADIUS_M || dist < 1) return false;
        if (q.elevation - p.elevation < MIN_HEIGHT_DIFF) return false;
        return azimuthDiff(bearingDeg(p, q), sunSideAz) < 45;
      });
    });
  }

  const median = (xs) => {
    const s = [...xs].sort((a, b) => a - b);
    const mid = s.length >> 1;
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  };

  // Flags likely survey errors with the modified z-score (Iglewicz & Hoaglin):
  // 0.6745 · |x − median| / MAD > 3.5. Mean ± 2σ, used before, lets the outlier
  // inflate the σ it is measured against: with n points no value can sit more
  // than (n − 1)/√n σ from the mean, so with 4–5 points nothing could ever be
  // flagged, not even 1450 m typed for 145 m.
  function detectOutliers(points) {
    const vals = points.map(p => p.elevation).filter(v => v != null);
    if (vals.length < 4) return points.map(() => false);
    const med = median(vals);
    const deviations = vals.map(v => Math.abs(v - med));
    let scale = median(deviations) / 0.6745;
    if (scale === 0) {
      // More than half the values are identical; fall back to the mean absolute deviation.
      scale = 1.253314 * (deviations.reduce((a, b) => a + b, 0) / deviations.length);
    }
    if (scale === 0) return points.map(() => false);
    return points.map(p => p.elevation != null && Math.abs(p.elevation - med) / scale > 3.5);
  }

  // Site boundary: Andrew's monotone chain on (lon, lat), a planar approximation
  // that is accurate enough for site-scale surveys (a few hundred meters).
  function convexHull(points) {
    const pts = points.map(p => [p.lon, p.lat]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if (pts.length < 3) return pts;

    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

    const lower = [];
    for (const p of pts) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
      lower.push(p);
    }
    const upper = [];
    for (let i = pts.length - 1; i >= 0; i--) {
      const p = pts[i];
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
      upper.push(p);
    }
    lower.pop();
    upper.pop();
    return lower.concat(upper);
  }

  // Shoelace formula on a local equirectangular projection (meters), centered on the site.
  function polygonAreaM2(hullLonLat, centerLat) {
    if (hullLonLat.length < 3) return 0;
    const mPerDegLat = 111000;
    const mPerDegLon = 111000 * Math.cos(centerLat * DEG);
    const xy = hullLonLat.map(([lon, lat]) => [lon * mPerDegLon, lat * mPerDegLat]);
    let sum = 0;
    for (let i = 0; i < xy.length; i++) {
      const [x1, y1] = xy[i];
      const [x2, y2] = xy[(i + 1) % xy.length];
      sum += x1 * y2 - x2 * y1;
    }
    return Math.abs(sum) / 2;
  }

  // Local east/north metres of lat/lon about (lat0, lon0) from the WGS84 radii of curvature
  // at lat0 (meridian M, prime vertical N), the east scale at the point's own latitude and
  // the curvature of the parallel to second order.
  // Longitudes wrap at ±180°. Against pyproj's exact local tangent plane (issue #63), a
  // 3 × 3 km site at 60° N is off by at most 2 mm.
  const WGS84_A = 6378137, WGS84_E2 = 0.00669437999014;
  function localMetres(lat, lon, lat0, lon0) {
    const s = Math.sin(lat0 * DEG), w = 1 - WGS84_E2 * s * s;
    const N = WGS84_A / Math.sqrt(w), M = WGS84_A * (1 - WGS84_E2) / (w * Math.sqrt(w));
    const dLon = ((lon - lon0 + 540) % 360) - 180;
    const l = dLon * DEG; // parallels curve towards the pole: the second-order term in north
    return [l * N * Math.cos(lat * DEG), (lat - lat0) * DEG * M + N * s * Math.cos(lat0 * DEG) * l * l / 2];
  }

  // Terrain as a whole: the least-squares plane z = a + b·east + c·north through the points
  // that have an elevation, in local metres about their centroid (issue #63). Returns
  //   slopeDeg    the plane's steepest slope;
  //   aspectDeg   the compass bearing it falls towards (null on a level plane);
  //   gradeEastPct, gradeNorthPct  the rise per 100 m going east and going north;
  //   rmsM        the root mean square of the residuals (how far the ground is from a plane);
  //   n           the points used.
  // null with fewer than three points, or when they lie on or near one line: a transect gives
  // the slope along it only, so the spread across it must be at least 5 % of the spread along
  // it (the ratio of the principal standard deviations). Every point counts equally:
  // an elevation outlier (detectOutliers) tilts the plane and shows up in rmsM.
  function terrainPlane(points) {
    const pts = points.filter(p => Number.isFinite(p.elevation) && Number.isFinite(p.lat) && Number.isFinite(p.lon));
    if (pts.length < 3) return null;
    const lat0 = pts.reduce((s, p) => s + p.lat, 0) / pts.length;
    const lon0 = pts[0].lon + pts.reduce((s, p) => s + (((p.lon - pts[0].lon + 540) % 360) - 180), 0) / pts.length;
    const xy = pts.map(p => localMetres(p.lat, p.lon, lat0, lon0));
    const mx = xy.reduce((s, q) => s + q[0], 0) / pts.length, my = xy.reduce((s, q) => s + q[1], 0) / pts.length;
    const mz = pts.reduce((s, p) => s + p.elevation, 0) / pts.length;
    let sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0;
    pts.forEach((p, i) => {
      const x = xy[i][0] - mx, y = xy[i][1] - my, z = p.elevation - mz;
      sxx += x * x; syy += y * y; sxy += x * y; sxz += x * z; syz += y * z;
    });
    const det = sxx * syy - sxy * sxy;
    const half = (sxx + syy) / 2, root = Math.sqrt(((sxx - syy) / 2) ** 2 + sxy * sxy);
    const minor = half - root, major = half + root; // principal spreads of the points
    if (!(major > 0) || !(minor > 0.05 * 0.05 * major)) return null; // on or near one line
    const b = (syy * sxz - sxy * syz) / det, c = (sxx * syz - sxy * sxz) / det;
    let ss = 0;
    pts.forEach((p, i) => {
      const r = p.elevation - mz - b * (xy[i][0] - mx) - c * (xy[i][1] - my);
      ss += r * r;
    });
    const grade = Math.hypot(b, c);
    return {
      slopeDeg: Math.atan(grade) / DEG,
      aspectDeg: grade > 1e-9 ? (Math.atan2(-b, -c) / DEG + 360) % 360 : null,
      gradeEastPct: b * 100, gradeNorthPct: c * 100,
      rmsM: Math.sqrt(ss / pts.length), n: pts.length,
    };
  }

  const api = {
    SHADING_SCAN_CAP, optimalAzimuth, azimuthDiff, circularMeanDeg, solarRating,
    haversineM, bearingDeg, detectShading, detectOutliers, convexHull, polygonAreaM2,
    localMetres, terrainPlane,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SiteGeometry = api;
})(typeof window !== 'undefined' ? window : globalThis);
