// ─── Skyline (horizon profile) from terrain elevations ──────
// The terrain around a site is sampled along 48 compass directions (every 7.5°,
// the same step as PVGIS) at 12 distances from 100 m to 25 km, spaced
// geometrically so near slopes and far ridges both get points. In each direction
// the skyline is the steepest elevation angle seen, after Earth curvature and
// atmospheric refraction. Elevations come from the Open-Meteo elevation API
// (Copernicus DEM GLO-90, global), which takes 100 locations per request and
// about 600 a minute per visitor: one site is 1 + 48·12 = 577 locations.
// Works in the browser (window.SiteHorizon) and in Node (require).

(function (root) {
  const DIRECTIONS = 48;
  const DISTANCES_M = Array.from({ length: 12 }, (_, j) => Math.round(100 * 250 ** (j / 11))); // 100 m … 25 km
  const EARTH_RADIUS_M = 6371000;
  const REFRACTION_K = 0.13; // standard coefficient: light bends with the curvature, by k
  const BATCH = 100;

  const DEG = Math.PI / 180;

  // Point at distance d (m) along compass bearing b (°) from lat/lon, on a sphere.
  function destination(lat, lon, bearingDeg, d) {
    const p1 = lat * DEG, l1 = lon * DEG, b = bearingDeg * DEG, a = d / EARTH_RADIUS_M;
    const p2 = Math.asin(Math.sin(p1) * Math.cos(a) + Math.cos(p1) * Math.sin(a) * Math.cos(b));
    const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(a) * Math.cos(p1), Math.cos(a) - Math.sin(p1) * Math.sin(p2));
    return [p2 / DEG, ((l2 / DEG + 540) % 360) - 180];
  }

  // The site itself first, then DISTANCES_M along each direction, north first, clockwise.
  function samplePoints(lat, lon) {
    const points = [[lat, lon]];
    for (let i = 0; i < DIRECTIONS; i++) {
      for (const d of DISTANCES_M) points.push(destination(lat, lon, (i * 360) / DIRECTIONS, d));
    }
    return points;
  }

  // Requests of at most 100 locations each.
  function elevationUrls(points) {
    const urls = [];
    for (let i = 0; i < points.length; i += BATCH) {
      const chunk = points.slice(i, i + BATCH);
      urls.push('https://api.open-meteo.com/v1/elevation' +
        `?latitude=${chunk.map(p => p[0].toFixed(5)).join(',')}` +
        `&longitude=${chunk.map(p => p[1].toFixed(5)).join(',')}`);
    }
    return urls;
  }

  // Elevations in samplePoints order → skyline angle in degrees per direction
  // (index 0 = north, clockwise), never below 0. A distant point drops below the
  // site's tangent plane by d²(1 − k)/2R: the curvature, less the refraction.
  function profileFromElevations(elevations) {
    const expected = 1 + DIRECTIONS * DISTANCES_M.length;
    if (elevations.length !== expected || !elevations.every(Number.isFinite)) {
      throw new Error(`expected ${expected} elevations, got ${elevations.length}`);
    }
    const h0 = elevations[0];
    return Array.from({ length: DIRECTIONS }, (_, i) => {
      let max = 0;
      DISTANCES_M.forEach((d, j) => {
        const rise = elevations[1 + i * DISTANCES_M.length + j] - h0 - (d * d * (1 - REFRACTION_K)) / (2 * EARTH_RADIUS_M);
        max = Math.max(max, Math.atan2(rise, d) / DEG);
      });
      return Math.round(max * 10) / 10;
    });
  }

  const api = { samplePoints, elevationUrls, profileFromElevations, destination, DIRECTIONS, DISTANCES_M, REFRACTION_K };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SiteHorizon = api;
})(typeof window !== 'undefined' ? window : globalThis);
