// ─── PV yield model from satellite irradiance ────────────────
// Monthly energy yield of a fixed PV array from NASA POWER climatology
// (20-year monthly means of global and diffuse horizontal irradiance and
// air temperature). Irradiance is transposed to the tilted plane with the
// isotropic-sky model (Liu & Jordan; Duffie & Beckman, "Solar Engineering of
// Thermal Processes", §2.19). The beam tilt factor R_b is integrated over the
// day of each month's recommended average date, which handles any tilt,
// azimuth and hemisphere with one formula. Validated against PVGIS in the
// README. Works in the browser (window.SolarModel) and in Node (require).

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
  };

  function declination(n) {
    return 23.45 * Math.sin(2 * Math.PI * (284 + n) / 365);
  }

  // Ratio of daily beam irradiation on the tilted surface to that on the horizontal.
  // tilt in degrees; compassAz in degrees (0 = N, 90 = E, 180 = S).
  function beamTiltFactor(lat, tilt, compassAz, n) {
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
      onPlane += Math.max(0, cosT);
    }
    return onHorizontal > 0 ? onPlane / onHorizontal : 0;
  }

  // climatology: { ghi[12], diffuse[12] } in kWh/m²/day and { temp[12] } in °C.
  // Returns monthly and annual yield in kWh per kWp, plus plane-of-array irradiation.
  function monthlyYield(climatology, lat, tilt, compassAz, options = {}) {
    const o = { ...DEFAULTS, ...options };
    const cosB = Math.cos(tilt * DEG);
    const months = MEAN_DAY.map((n, m) => {
      const H = climatology.ghi[m];
      const Hd = Math.min(climatology.diffuse[m], H);
      const Rb = beamTiltFactor(lat, tilt, compassAz, n);
      const poaDaily = (H - Hd) * Rb + Hd * (1 + cosB) / 2 + H * o.groundAlbedo * (1 - cosB) / 2;
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

  const api = { beamTiltFactor, monthlyYield, parsePowerClimatology, powerClimatologyUrl, DEFAULTS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SolarModel = api;
})(typeof window !== 'undefined' ? window : globalThis);
