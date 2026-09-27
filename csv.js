// CSV parsing shared by the browser and Node tests.
(function (root) {
  // ─── CSV Parser ───────────────────────────────────────────
  // Handles RFC 4180 quoted fields (commas and escaped quotes inside quotes).
  // Records are split on newlines first, so a quoted field cannot span lines.

  function parseCSVLine(line) {
    const fields = [];
    let field = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = !inQuotes; }
      } else if (ch === ',' && !inQuotes) {
        fields.push(field.trim());
        field = '';
      } else {
        field += ch;
      }
    }
    fields.push(field.trim());
    return fields;
  }

  function parseCSV(text) {
    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n');
    if (lines.length < 2) throw new Error('CSV must have a header row and at least one data row');

    const rawHeader = parseCSVLine(lines[0]);
    const header = rawHeader.map(h => h.toLowerCase().replace(/\s+/g, ''));

    const colIdx = {
      lat:       header.findIndex(h => h.includes('lat')),
      lon:       header.findIndex(h => h.includes('lon') || h.includes('lng')),
      elevation: header.findIndex(h => h.includes('elev') || h.includes('alt') || h.includes('height')),
      slope:     header.findIndex(h => h.includes('slope') || h.includes('tilt') || h.includes('inclin')),
      azimuth:   header.findIndex(h => h.includes('az') || h.includes('orient') || h.includes('bearing')),
    };

    if (colIdx.lat === -1 || colIdx.lon === -1) {
      throw new Error('CSV must contain "lat" and "lon" (or "lng") columns');
    }

    const points = [];
    const rowErrors = [];

    lines.slice(1).forEach((line, i) => {
      if (!line.trim()) return;
      const rowNum = i + 2;
      const cols = parseCSVLine(line);
      const parseNum = (idx) => (idx !== -1 && cols[idx] !== '') ? parseFloat(cols[idx]) : null;

      const lat  = parseFloat(cols[colIdx.lat]);
      const lon  = parseFloat(cols[colIdx.lon]);
      const elevation = parseNum(colIdx.elevation);
      const slope     = parseNum(colIdx.slope);
      const azimuth   = parseNum(colIdx.azimuth);

      const errors = [];
      if (isNaN(lat) || lat < -90  || lat > 90)   errors.push(`lat must be −90 to 90 (got "${cols[colIdx.lat]}")`);
      if (isNaN(lon) || lon < -180 || lon > 180)   errors.push(`lon must be −180 to 180 (got "${cols[colIdx.lon]}")`);
      if (elevation != null && (isNaN(elevation) || elevation < -500 || elevation > 9000))
        errors.push(`elevation out of range −500–9000 m`);
      if (slope != null && (isNaN(slope) || slope < 0 || slope > 90))
        errors.push(`slope must be 0–90° (got "${cols[colIdx.slope]}")`);
      if (azimuth != null && (isNaN(azimuth) || azimuth < 0 || azimuth > 360))
        errors.push(`azimuth must be 0–360° (got "${cols[colIdx.azimuth]}")`);

      if (errors.length) {
        rowErrors.push(`Row ${rowNum}: ${errors.join('; ')}`);
        return;
      }

      points.push({ lat, lon, elevation, slope, azimuth });
    });

    return { points, rowErrors };
  }

  const api = { parseCSVLine, parseCSV };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CsvParser = api;
})(typeof window !== 'undefined' ? window : globalThis);
