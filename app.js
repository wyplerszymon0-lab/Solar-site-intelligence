// Static system prompt — cached on first request, reused on subsequent calls
const SYSTEM_PROMPT =
  'You are a solar energy site assessment expert with geodetic expertise. ' +
  'Analyze photovoltaic installation sites and provide structured technical reports ' +
  'with specific numerical recommendations. Be precise, use measurements, and keep ' +
  'each section to 2–4 sentences.';

const DEMO_DATA = [
  { lat: 38.7223, lon: -9.1393, elevation: 145, slope: 12, azimuth: 175 },
  { lat: 38.7225, lon: -9.1390, elevation: 147, slope: 11, azimuth: 178 },
  { lat: 38.7227, lon: -9.1387, elevation: 149, slope: 13, azimuth: 172 },
  { lat: 38.7220, lon: -9.1396, elevation: 143, slope: 10, azimuth: 180 },
  { lat: 38.7229, lon: -9.1384, elevation: 151, slope: 15, azimuth: 168 },
  { lat: 38.7218, lon: -9.1399, elevation: 141, slope: 9,  azimuth: 182 },
  { lat: 38.7231, lon: -9.1381, elevation: 153, slope: 16, azimuth: 165 },
  { lat: 38.7216, lon: -9.1402, elevation: 139, slope: 8,  azimuth: 185 },
  { lat: 38.7233, lon: -9.1378, elevation: 155, slope: 18, azimuth: 162 },
  { lat: 38.7214, lon: -9.1405, elevation: 137, slope: 7,  azimuth: 188 },
];

let map = null;
let markers = [];
let boundaryLayer = null;
let currentData = [];
let lastAiText = '';

// ─── Map ──────────────────────────────────────────────────

function initMap() {
  map = L.map('map', { zoomControl: true, attributionControl: true }).setView([38.7223, -9.1393], 2);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 20,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  }).addTo(map);
}

initMap();

// ─── Toast ────────────────────────────────────────────────

function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast ' + type;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3500);
}

// ─── API key persistence (opt-in, this browser only) ──────
// Off by default. The key never leaves the browser except in the direct
// request to api.anthropic.com — storing it is purely a local convenience.

const API_KEY_STORAGE = 'solarSite.apiKey';

(function initApiKeyPersistence() {
  const keyInput   = document.getElementById('api-key');
  const rememberCb = document.getElementById('remember-key');

  try {
    const saved = localStorage.getItem(API_KEY_STORAGE);
    if (saved) { keyInput.value = saved; rememberCb.checked = true; }
  } catch { /* localStorage unavailable (private mode, etc.) — ignore */ }

  rememberCb.addEventListener('change', () => {
    try {
      if (rememberCb.checked) localStorage.setItem(API_KEY_STORAGE, keyInput.value);
      else localStorage.removeItem(API_KEY_STORAGE);
    } catch { /* ignore */ }
  });

  keyInput.addEventListener('input', () => {
    if (!rememberCb.checked) return;
    try { localStorage.setItem(API_KEY_STORAGE, keyInput.value); } catch { /* ignore */ }
  });
})();

// ─── Domain logic ─────────────────────────────────────────

// Northern hemisphere ⇒ panels face true south (180°); southern hemisphere ⇒ true north (0°/360°).
function optimalAzimuth(lat) {
  return lat >= 0 ? 180 : 0;
}

// Circular distance between two compass bearings (handles wrap-around at 0°/360°).
function azimuthDiff(az, target) {
  const d = Math.abs(az - target);
  return Math.min(d, 360 - d);
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

function estimateYield(lat, avgSlope, avgAzimuth) {
  const optTilt = Math.abs(lat) * 0.9;
  const tiltDiff = Math.abs((avgSlope ?? optTilt) - optTilt);
  const azDiff = azimuthDiff(avgAzimuth ?? optimalAzimuth(lat), optimalAzimuth(lat));
  return Math.round(1600 - Math.abs(Math.abs(lat) - 38) * 15 - tiltDiff * 3 - azDiff * 2);
}

// ─── Site boundary (convex hull) ─────────────────────────
// Andrew's monotone chain — points are (lon, lat), planar approximation
// which is accurate enough for site-scale surveys (a few hundred meters).

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
  const mPerDegLon = 111000 * Math.cos(centerLat * Math.PI / 180);
  const xy = hullLonLat.map(([lon, lat]) => [lon * mPerDegLon, lat * mPerDegLat]);
  let sum = 0;
  for (let i = 0; i < xy.length; i++) {
    const [x1, y1] = xy[i];
    const [x2, y2] = xy[(i + 1) % xy.length];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

// ─── CSV Parser ───────────────────────────────────────────
// Handles RFC 4180 quoted fields (commas and newlines inside quotes, escaped quotes)

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

  if (rowErrors.length) {
    const summary = rowErrors.length === 1
      ? `Skipped 1 invalid row: ${rowErrors[0]}`
      : `Skipped ${rowErrors.length} invalid rows (see console for details)`;
    showToast(summary, 'error');
    console.warn('[Solar Site] CSV validation errors:\n' + rowErrors.join('\n'));
  }

  if (points.length === 0) throw new Error('No valid data rows after validation');
  return points;
}

// ─── Render data to map + sidebar ────────────────────────

function renderData(data) {
  currentData = data;
  lastAiText = '';

  markers.forEach(m => map.removeLayer(m));
  markers = [];
  if (boundaryLayer) { map.removeLayer(boundaryLayer); boundaryLayer = null; }

  document.getElementById('map-empty').classList.add('hidden');
  document.getElementById('map-overlay').style.display = 'flex';
  document.getElementById('stats-section').style.display = 'block';
  document.getElementById('table-section').style.display = 'block';
  document.getElementById('analyze-btn').disabled = false;
  document.getElementById('export-csv-btn').style.display = '';
  document.getElementById('copy-report-btn').style.display = 'none';

  resetAiPanel(`${data.length} points loaded — click "Analyze Site →" to run AI analysis`);

  const tbody = document.getElementById('table-body');
  tbody.innerHTML = '';

  const bounds = [];
  let totalSlope = 0, totalAz = 0, totalElev = 0, validSlope = 0, validAz = 0, validElev = 0;

  data.forEach((pt, i) => {
    const rating = solarRating(pt.lat, pt.slope, pt.azimuth);
    const color  = rating === 'good' ? '#3ddc84' : rating === 'mid' ? '#f0c040' : '#ff5252';

    // Map marker
    const icon = L.divIcon({
      className: '',
      html: `<div style="width:12px;height:12px;background:${color};transform:rotate(45deg);border:1px solid rgba(0,0,0,0.5);box-shadow:0 0 8px ${color}44"></div>`,
      iconSize: [12, 12],
      iconAnchor: [6, 6],
    });

    // Popup built with DOM to avoid innerHTML with user data
    const popup = document.createElement('div');
    popup.style.cssText = 'font-family:monospace;font-size:11px;line-height:1.8;color:#e8eaeb;background:#111518;padding:4px';
    const title = document.createElement('b');
    title.style.color = '#f0c040';
    title.textContent = `Point #${i + 1}`;
    popup.appendChild(title);
    [
      `LAT: ${pt.lat.toFixed(5)}`,
      `LON: ${pt.lon.toFixed(5)}`,
      `ELEVATION: ${pt.elevation ?? '—'} m`,
      `SLOPE: ${pt.slope ?? '—'}°`,
      `AZIMUTH: ${pt.azimuth ?? '—'}°`,
    ].forEach(line => {
      popup.appendChild(document.createElement('br'));
      popup.appendChild(document.createTextNode(line));
    });
    popup.appendChild(document.createElement('br'));
    const ratingNode = document.createElement('span');
    ratingNode.style.color = color;
    ratingNode.textContent = `RATING: ${rating.toUpperCase()}`;
    popup.appendChild(ratingNode);

    const marker = L.marker([pt.lat, pt.lon], { icon }).addTo(map).bindPopup(popup);
    markers.push(marker);
    bounds.push([pt.lat, pt.lon]);

    if (pt.slope     != null) { totalSlope += pt.slope;     validSlope++; }
    if (pt.azimuth   != null) { totalAz    += pt.azimuth;   validAz++; }
    if (pt.elevation != null) { totalElev  += pt.elevation; validElev++; }

    // Table row — textContent only, no innerHTML
    const tr = tbody.insertRow();
    [i + 1, pt.lat.toFixed(4), pt.lon.toFixed(4), pt.elevation ?? '—', pt.slope ?? '—', pt.azimuth ?? '—']
      .forEach(val => { tr.insertCell().textContent = val; });
    const ratingCell = tr.insertCell();
    const tag = document.createElement('span');
    tag.className = `tag tag-${rating}`;
    tag.textContent = rating;
    ratingCell.appendChild(tag);
  });

  if (bounds.length > 1) map.fitBounds(bounds, { padding: [40, 40] });
  else if (bounds.length === 1) map.setView(bounds[0], 17);

  const avgSlope = validSlope ? totalSlope / validSlope : null;
  const avgAz    = validAz    ? totalAz    / validAz    : null;
  const avgElev  = validElev  ? totalElev  / validElev  : null;
  const centerLat = data.reduce((s, p) => s + p.lat, 0) / data.length;
  const yieldEst  = estimateYield(centerLat, avgSlope, avgAz);
  const optTilt   = (Math.abs(centerLat) * 0.9).toFixed(0);
  const facing    = optimalAzimuth(centerLat) === 180 ? 'South' : 'North';

  document.getElementById('stat-points').textContent    = data.length;
  document.getElementById('stat-avg-slope').textContent = avgSlope != null ? avgSlope.toFixed(1) : '—';
  document.getElementById('stat-avg-az').textContent    = avgAz    != null ? Math.round(avgAz)   : '—';
  document.getElementById('stat-avg-elev').textContent  = avgElev  != null ? avgElev.toFixed(0)   : '—';

  // Site boundary: convex hull of the survey points, drawn on the map and
  // used for a more accurate area estimate than a plain bounding box.
  let area;
  if (data.length >= 3) {
    const hull = convexHull(data);
    area = Math.round(polygonAreaM2(hull, centerLat));
    boundaryLayer = L.polygon(hull.map(([lon, lat]) => [lat, lon]), {
      color: '#f0c040',
      weight: 1.5,
      dashArray: '4 4',
      fillColor: '#f0c040',
      fillOpacity: 0.06,
    }).addTo(map);
  } else {
    const lats = data.map(p => p.lat);
    const lons = data.map(p => p.lon);
    const dLat = (Math.max(...lats) - Math.min(...lats)) * 111000;
    const dLon = (Math.max(...lons) - Math.min(...lons)) * 111000 * Math.cos(centerLat * Math.PI / 180);
    area = Math.round(dLat * dLon);
  }
  document.getElementById('stat-area').textContent = area > 0 ? area.toLocaleString() : '—';

  document.getElementById('badge-tilt').textContent   = optTilt + '°';
  document.getElementById('badge-facing').textContent = facing;
  document.getElementById('badge-yield').textContent  = yieldEst.toLocaleString() + ' kWh/kWp/yr';
  document.getElementById('point-count').textContent  = data.length + ' POINTS LOADED';
}

// ─── AI panel helpers ─────────────────────────────────────

function resetAiPanel(placeholderText) {
  const aiBody = document.getElementById('ai-body');
  aiBody.innerHTML = '';
  const ph = document.createElement('div');
  ph.className = 'ai-placeholder';
  const span = document.createElement('span');
  span.textContent = placeholderText;
  ph.appendChild(span);
  aiBody.appendChild(ph);
}

function formatAIResponse(text) {
  return text
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:var(--accent)">$1</strong>');
}

// ─── Analyze (streaming + prompt caching) ────────────────

document.getElementById('analyze-btn').addEventListener('click', async () => {
  const apiKey = document.getElementById('api-key').value.trim();
  if (!apiKey)             { showToast('Enter your Anthropic API key first', 'error'); return; }
  if (!currentData.length) { showToast('No data to analyze', 'error'); return; }

  const btn = document.getElementById('analyze-btn');
  btn.disabled = true;
  btn.textContent = 'Analyzing...';
  document.getElementById('copy-report-btn').style.display = 'none';

  const aiBody = document.getElementById('ai-body');
  aiBody.innerHTML = '';
  const loadingEl = document.createElement('div');
  loadingEl.className = 'loading-dots';
  loadingEl.textContent = 'Running AI analysis';
  aiBody.appendChild(loadingEl);

  const lats = currentData.map(p => p.lat);
  const lons = currentData.map(p => p.lon);
  const centerLat = (Math.max(...lats) + Math.min(...lats)) / 2;
  const centerLon = (Math.max(...lons) + Math.min(...lons)) / 2;

  const slopes     = currentData.filter(p => p.slope     != null).map(p => p.slope);
  const azimuths   = currentData.filter(p => p.azimuth   != null).map(p => p.azimuth);
  const elevations = currentData.filter(p => p.elevation != null).map(p => p.elevation);
  const avg = arr => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : 'N/A';

  const latLabel = `${Math.abs(centerLat).toFixed(4)}°${centerLat >= 0 ? 'N' : 'S'}`;
  const lonLabel = `${Math.abs(centerLon).toFixed(4)}°${centerLon >= 0 ? 'E' : 'W'}`;
  const facingLabel = optimalAzimuth(centerLat) === 180 ? 'south (180°)' : 'north (0°)';

  const userPrompt =
    `Analyze this photovoltaic installation site based on geodetic measurements:\n\n` +
    `LOCATION: ${latLabel}, ${lonLabel}\n` +
    `HEMISPHERE-OPTIMAL PANEL FACING: ${facingLabel}\n` +
    `MEASUREMENT POINTS: ${currentData.length}\n` +
    `AVERAGE SLOPE: ${avg(slopes)}°\n` +
    `SLOPE RANGE: ${slopes.length ? Math.min(...slopes).toFixed(1) + '° – ' + Math.max(...slopes).toFixed(1) + '°' : 'N/A'}\n` +
    `AVERAGE AZIMUTH: ${avg(azimuths)}°\n` +
    `ELEVATION RANGE: ${elevations.length ? Math.min(...elevations).toFixed(0) + ' – ' + Math.max(...elevations).toFixed(0) + ' m' : 'N/A'}\n\n` +
    `Provide a structured analysis with these sections:\n\n` +
    `### Site Assessment\n` +
    `### Optimal Panel Configuration\n` +
    `### Estimated Energy Yield\n` +
    `### Risk Factors\n` +
    `### Recommendations`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        'anthropic-beta': 'prompt-caching-2024-07-31',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 1000,
        stream: true,
        system: [
          // Cache the static expert persona — reused across analyses
          { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
        ],
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `API error ${response.status}`);
    }

    const reader  = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer   = '';
    let fullText = '';

    const responseEl = document.createElement('div');
    responseEl.className = 'ai-response';
    aiBody.innerHTML = '';
    aiBody.appendChild(responseEl);

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // hold incomplete line for next chunk

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        if (raw === '[DONE]') continue;
        try {
          const event = JSON.parse(raw);
          if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
            fullText += event.delta.text;
            responseEl.innerHTML = formatAIResponse(fullText);
            aiBody.scrollTop = aiBody.scrollHeight;
          }
        } catch { /* incomplete JSON chunk — safe to skip */ }
      }
    }

    lastAiText = fullText;
    document.getElementById('copy-report-btn').style.display = '';
    showToast('Analysis complete', 'success');
  } catch (err) {
    aiBody.innerHTML = '';
    const errEl = document.createElement('div');
    errEl.style.cssText = 'color:var(--red);font-size:12px';
    errEl.textContent = 'Error: ' + err.message;
    aiBody.appendChild(errEl);
    showToast('Analysis failed: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Analyze Site →';
  }
});

// ─── CSV upload ───────────────────────────────────────────

function handleFile(file) {
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const data = parseCSV(ev.target.result);
      renderData(data);
      showToast(`Loaded ${data.length} measurement points`, 'success');
    } catch (err) {
      showToast('CSV Error: ' + err.message, 'error');
    }
  };
  reader.readAsText(file);
}

document.getElementById('csv-input').addEventListener('change', (e) => {
  if (e.target.files[0]) handleFile(e.target.files[0]);
  e.target.value = ''; // allow re-uploading the same file
});

const uploadZone = document.getElementById('upload-zone');
uploadZone.addEventListener('dragover',  (e) => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
uploadZone.addEventListener('dragleave', ()  => uploadZone.classList.remove('drag-over'));
uploadZone.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadZone.classList.remove('drag-over');
  if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
});

document.getElementById('demo-btn').addEventListener('click', () => {
  renderData(DEMO_DATA);
  showToast('Demo data loaded — Lisbon region, Portugal', 'success');
});

// ─── Export CSV with ratings ──────────────────────────────

document.getElementById('export-csv-btn').addEventListener('click', () => {
  if (!currentData.length) return;
  const header = 'lat,lon,elevation,slope,azimuth,rating';
  const rows = currentData.map(pt =>
    [pt.lat, pt.lon, pt.elevation ?? '', pt.slope ?? '', pt.azimuth ?? '', solarRating(pt.lat, pt.slope, pt.azimuth)].join(',')
  );
  const csv  = [header, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = 'solar-site-analysis.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('CSV exported', 'success');
});

// ─── Copy AI report ───────────────────────────────────────

document.getElementById('copy-report-btn').addEventListener('click', async () => {
  if (!lastAiText) return;
  try {
    await navigator.clipboard.writeText(lastAiText);
    showToast('Report copied to clipboard', 'success');
  } catch {
    showToast('Copy failed — select the text manually', 'error');
  }
});
