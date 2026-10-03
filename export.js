// ─── Export builders ────────────────────────────────────────
// Pure functions that turn survey points and computeSiteStats() output into
// export formats: the GeoJSON download and the monthly-yield table in the
// printed (PDF) report.
// Works in the browser (window.SiteExport) and in Node (require).

(function (root) {
  // Machine-readable yield source. While satellite data is still loading the
  // numbers come from the rough formula, so they are labelled 'heuristic' too.
  function yieldSourceId(yieldSource) {
    return yieldSource === 'satellite' ? 'nasa_power' : 'heuristic';
  }

  function buildGeoJSON(data, stats) {
    const features = data.map((pt, i) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [pt.lon, pt.lat] },
      properties: {
        id: i + 1,
        elevation: pt.elevation,
        slope: pt.slope,
        azimuth: pt.azimuth,
        rating: stats.ratings[i],
        shading_risk: stats.shadingFlags[i],
        elevation_outlier: stats.outlierFlags[i],
      },
    }));
    if (stats.hull.length >= 3) {
      const ring = stats.hull.map(([lon, lat]) => [lon, lat]);
      ring.push(ring[0]);
      features.push({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [ring] },
        properties: {
          name: 'site_boundary',
          area_m2: stats.area,
          yield_annual_kwh_per_kwp: stats.yieldEst,
          yield_monthly_kwh_per_kwp: stats.seasonal.slice(),
          yield_source: yieldSourceId(stats.yieldSource),
        },
      });
    }
    return { type: 'FeatureCollection', features };
  }

  // Two-row table (month names, values) for the print header. Only numbers and
  // the caller's own month labels are interpolated, never survey text.
  function monthlyYieldTableHTML(values, monthNames, caption) {
    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
    const head = monthNames.map((m) => `<th>${esc(m)}</th>`).join('');
    const cells = values.map((v) => `<td>${Math.round(v).toLocaleString('en-US')}</td>`).join('');
    return `<table class="print-monthly-table"><caption>${esc(caption)}</caption>` +
      `<thead><tr>${head}</tr></thead>` +
      `<tbody><tr>${cells}</tr></tbody></table>`;
  }

  const api = { yieldSourceId, buildGeoJSON, monthlyYieldTableHTML };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SiteExport = api;
})(typeof window !== 'undefined' ? window : globalThis);
