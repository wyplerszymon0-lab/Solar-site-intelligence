// ─── CSV parsing for geodetic survey files ──────────────────
// Handles RFC 4180 quoted fields (delimiters and escaped quotes inside quotes).
// Records are split on newlines first, so a quoted field cannot span lines.
// Accepts comma-separated files and the semicolon + decimal-comma format that
// Excel writes in most European locales. Works in the browser (window.SurveyCSV)
// and in Node (require).

(function (root) {
  function parseCSVLine(line, delimiter = ',') {
    const fields = [];
    let field = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = !inQuotes; }
      } else if (ch === delimiter && !inQuotes) {
        fields.push(field.trim());
        field = '';
      } else {
        field += ch;
      }
    }
    fields.push(field.trim());
    return fields;
  }

  // Semicolon files come from locales that also use a decimal comma.
  function detectDelimiter(headerLine) {
    const count = (ch) => headerLine.split(ch).length - 1;
    return count(';') > count(',') ? ';' : ',';
  }

  function findColumns(header) {
    const find = (...keys) => header.findIndex(h => keys.some(k => h.includes(k)));
    return {
      lat:       find('lat'),
      lon:       find('lon', 'lng'),
      elevation: find('elev', 'alt', 'height'),
      slope:     find('slope', 'tilt', 'inclin'),
      azimuth:   find('az', 'orient', 'bearing'),
    };
  }

  // Returns { points, rowErrors }. Throws only when the file as a whole is unusable.
  function parseCSV(text) {
    const lines = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').trim().split('\n');
    if (lines.length < 2) throw new Error('CSV must have a header row and at least one data row');

    const delimiter = detectDelimiter(lines[0]);
    const header = parseCSVLine(lines[0], delimiter).map(h => h.toLowerCase().replace(/\s+/g, ''));
    const col = findColumns(header);
    if (col.lat === -1 || col.lon === -1 || col.lat === col.lon) {
      throw new Error('CSV must contain separate "lat" and "lon" (or "lng") columns');
    }

    // Strict numbers: "145m" or "12abc" is an error, not 145 or 12.
    const toNumber = (raw) => {
      const s = delimiter === ';' ? raw.replace(',', '.') : raw;
      return s === '' ? NaN : Number(s);
    };

    const points = [];
    const rowErrors = [];
    lines.slice(1).forEach((line, i) => {
      if (!line.trim()) return;
      const cols = parseCSVLine(line, delimiter);
      const cell = (idx) => (idx !== -1 && cols[idx] !== undefined ? cols[idx] : '');
      const optional = (idx) => (cell(idx) === '' ? null : toNumber(cell(idx)));

      const lat = toNumber(cell(col.lat));
      const lon = toNumber(cell(col.lon));
      const elevation = optional(col.elevation);
      const slope = optional(col.slope);
      const azimuth = optional(col.azimuth);

      const errors = [];
      if (isNaN(lat) || lat < -90 || lat > 90) errors.push(`lat must be −90 to 90 (got "${cell(col.lat)}")`);
      if (isNaN(lon) || lon < -180 || lon > 180) errors.push(`lon must be −180 to 180 (got "${cell(col.lon)}")`);
      if (elevation != null && (isNaN(elevation) || elevation < -500 || elevation > 9000))
        errors.push(`elevation must be −500 to 9000 m (got "${cell(col.elevation)}")`);
      if (slope != null && (isNaN(slope) || slope < 0 || slope > 90))
        errors.push(`slope must be 0–90° (got "${cell(col.slope)}")`);
      if (azimuth != null && (isNaN(azimuth) || azimuth < 0 || azimuth > 360))
        errors.push(`azimuth must be 0–360° (got "${cell(col.azimuth)}")`);

      if (errors.length) rowErrors.push(`Row ${i + 2}: ${errors.join('; ')}`);
      else points.push({ lat, lon, elevation, slope, azimuth });
    });

    if (points.length === 0) throw new Error('No valid data rows after validation');
    return { points, rowErrors };
  }

  const api = { parseCSV, parseCSVLine, detectDelimiter };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SurveyCSV = api;
})(typeof window !== 'undefined' ? window : globalThis);
