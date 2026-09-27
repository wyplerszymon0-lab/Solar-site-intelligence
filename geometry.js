(function (root) {
  const SHADING_SCAN_CAP = 1000;

  // Northern sites face south; southern sites face north.
  function optimalAzimuth(lat) {
    return lat >= 0 ? 180 : 0;
  }

  // Circular distance handles wrap-around at 0°/360°.
  function azimuthDiff(az, target) {
    const difference = Math.abs(az - target);
    return Math.min(difference, 360 - difference);
  }

  // Averaging 350° and 10° arithmetically points south instead of north.
  function circularMeanDeg(bearings) {
    if (!bearings.length) return null;
    let x = 0;
    let y = 0;
    bearings.forEach((bearing) => {
      x += Math.cos((bearing * Math.PI) / 180);
      y += Math.sin((bearing * Math.PI) / 180);
    });
    if (Math.hypot(x, y) < 1e-9 * bearings.length) return null;
    return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  }

  function haversineM(p1, p2) {
    const radius = 6371000;
    const phi1 = (p1.lat * Math.PI) / 180;
    const phi2 = (p2.lat * Math.PI) / 180;
    const dPhi = ((p2.lat - p1.lat) * Math.PI) / 180;
    const dLambda = ((p2.lon - p1.lon) * Math.PI) / 180;
    const a =
      Math.sin(dPhi / 2) ** 2 +
      Math.cos(phi1) *
        Math.cos(phi2) *
        Math.sin(dLambda / 2) ** 2;
    return 2 * radius * Math.asin(Math.sqrt(a));
  }

  function bearingDeg(p1, p2) {
    const phi1 = (p1.lat * Math.PI) / 180;
    const phi2 = (p2.lat * Math.PI) / 180;
    const dLambda = ((p2.lon - p1.lon) * Math.PI) / 180;
    const y = Math.sin(dLambda) * Math.cos(phi2);
    const x =
      Math.cos(phi1) * Math.sin(phi2) -
      Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
    return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  }

  // This rough heuristic only flags a higher neighbor within 30 m on the sun side.
  function detectShading(points, lat) {
    if (points.length > SHADING_SCAN_CAP) return points.map(() => false);
    const sunSideAz = optimalAzimuth(lat);
    const radiusM = 30;
    const minHeightDiff = 3;
    return points.map((point) => {
      if (point.elevation == null) return false;
      return points.some((neighbor) => {
        if (neighbor === point || neighbor.elevation == null) return false;
        const distance = haversineM(point, neighbor);
        if (distance > radiusM || distance < 1) return false;
        if (neighbor.elevation - point.elevation < minHeightDiff) return false;
        return azimuthDiff(bearingDeg(point, neighbor), sunSideAz) < 45;
      });
    });
  }

  // Elevations more than two standard deviations from the mean are flagged.
  function detectOutliers(points) {
    const values = points.map((point) => point.elevation).filter((value) => value != null);
    if (values.length < 4) return points.map(() => false);
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance =
      values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
    const standardDeviation = Math.sqrt(variance);
    if (standardDeviation === 0) return points.map(() => false);
    return points.map(
      (point) =>
        point.elevation != null &&
        Math.abs(point.elevation - mean) > 2 * standardDeviation,
    );
  }

  const api = {
    azimuthDiff,
    bearingDeg,
    circularMeanDeg,
    detectOutliers,
    detectShading,
    haversineM,
    optimalAzimuth,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SolarGeometry = api;
})(typeof window !== "undefined" ? window : globalThis);
