// ─── Constants ──────────────────────────────────────────────

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

const BENCHMARK_YIELD_KWH = 1500;   // rough global reference for a well-oriented, well-tilted system
const CLUSTER_THRESHOLD   = 150;    // switch to marker clustering above this many points
const SHADING_SCAN_CAP    = 1000;   // skip the O(n²) shading heuristic above this many points
const TABLE_ROW_CAP       = 500;    // render at most this many rows in the points table
const PANEL_ROW_HEIGHT_M  = 1.7;    // assumed slant height of a panel row, for row-spacing estimate

const API_KEY_STORAGE     = 'solarSite.apiKey';
const LANG_STORAGE        = 'solarSite.lang';
const HISTORY_STORAGE     = 'solarSite.history';
const LAST_SESSION_STORAGE = 'solarSite.lastSession';
const HISTORY_LIMIT       = 15;

const SECTION_HEADERS = {
  en: ['Site Assessment', 'Optimal Panel Configuration', 'Estimated Energy Yield', 'Risk Factors', 'Recommendations'],
  pl: ['Ocena Lokalizacji', 'Optymalna Konfiguracja Paneli', 'Szacowana Wydajność Energetyczna', 'Czynniki Ryzyka', 'Rekomendacje'],
};

// ─── i18n ───────────────────────────────────────────────────

const I18N = {
  en: {
    'header.ready': 'SYSTEM READY',
    'header.pointsLoaded': '{n} POINTS LOADED',
    'cfg.label': 'Configuration',
    'cfg.apiKey': 'ANTHROPIC API KEY',
    'cfg.remember': 'Remember on this device (stored only in this browser)',
    'cfg.keyNote': 'Sent directly from your browser to api.anthropic.com — never touches a backend. Only use a key on devices you trust.',
    'cfg.model': 'AI MODEL',
    'model.opus': 'Opus 5 — highest quality, slower',
    'model.sonnet': 'Sonnet 5 — balanced (recommended)',
    'model.haiku': 'Haiku 4.5 — fastest, cheapest',
    'data.label': 'Data Input',
    'upload.title': 'Upload CSV File',
    'upload.subtitle': 'Drop geodetic measurement data',
    'csv.expected': 'Expected columns:',
    'csv.min': 'lat, lon, elevation (minimum)',
    'demo.btn': '⬡ Load Demo Data (Portugal)',
    'demo.siteLabel': 'Portugal PV Site (Demo)',
    'history.label': 'Saved Analyses (this browser)',
    'history.save': '💾 Save Current Analysis',
    'history.empty': 'No saved analyses yet',
    'history.promptName': 'Name this analysis:',
    'stats.label': 'Site Statistics',
    'stat.points': 'Measure Points',
    'stat.avgSlope': 'Avg Slope °',
    'stat.avgAz': 'Avg Azimuth °',
    'stat.avgElev': 'Avg Elevation m',
    'stat.area': 'Site Area est. m²',
    'stat.rows': 'Est. Panel Rows',
    'stat.benchmark': 'vs Typical Yield (~1500 kWh/kWp/yr)',
    'export.csv': '↓ CSV',
    'export.geojson': '↓ GeoJSON',
    'export.pdf': '🖨 PDF Report',
    'export.share': '🔗 Share Link',
    'charts.label': 'Site Charts',
    'charts.rating': 'Rating Distribution',
    'charts.elevation': 'Elevation Profile',
    'charts.slope': 'Slope per Point °',
    'charts.azimuth': 'Azimuth vs Optimal',
    'charts.seasonal': 'Est. Monthly Yield',
    'charts.empty': 'Not enough data',
    'charts.compassAvg': 'Avg azimuth',
    'charts.compassOptimal': 'Optimal',
    'rating.good': 'Good',
    'rating.mid': 'Mid',
    'rating.bad': 'Bad',
    'table.label': 'Measurement Points',
    'table.hash': '#',
    'table.lat': 'LAT',
    'table.lon': 'LON',
    'table.elev': 'ELEV',
    'table.slope': 'SLOPE',
    'table.az': 'AZ',
    'table.rating': 'RATING',
    'table.flags': 'FLAGS',
    'table.truncated': 'Showing first {shown} of {total} rows — use CSV/GeoJSON export for the full dataset',
    'map.awaiting': 'AWAITING GEODETIC DATA',
    'map.uploadPrompt': 'UPLOAD CSV TO BEGIN ANALYSIS',
    'map.markers': 'Markers',
    'map.heatmap': 'Heatmap',
    'map.site': 'SITE:',
    'map.tilt': 'OPTIMAL TILT:',
    'map.facing': 'PANEL FACING:',
    'map.yield': 'EST. YIELD:',
    'facing.south': 'South',
    'facing.north': 'North',
    'ai.title': 'AI Site Analysis',
    'ai.copy': '⎘ Copy Report',
    'ai.analyze': 'Analyze Site →',
    'ai.analyzing': 'Analyzing...',
    'ai.loading': 'Running AI analysis',
    'ai.pointsLoaded': '{n} points loaded — click "Analyze Site →" to run AI analysis',
    'ai.placeholder1': 'Waiting for geodetic data upload',
    'ai.placeholder2': 'AI will analyze slope, azimuth, location',
    'ai.placeholder3': 'Recommendations for PV panel layout',
    'ai.placeholder4': 'Estimated annual energy yield',
    'ai.you': 'You',
    'chat.placeholder': 'Ask a follow-up question...',
    'chat.send': 'Send',
    'toast.noKey': 'Enter your Anthropic API key first',
    'toast.noData': 'No data to analyze',
    'toast.analysisComplete': 'Analysis complete',
    'toast.analysisFailed': 'Analysis failed: ',
    'toast.csvLoaded': 'Loaded {n} measurement points',
    'toast.csvError': 'CSV Error: ',
    'toast.demoLoaded': 'Demo data loaded — Lisbon region, Portugal',
    'toast.csvExported': 'CSV exported',
    'toast.geojsonExported': 'GeoJSON exported',
    'toast.copySuccess': 'Report copied to clipboard',
    'toast.copyFail': 'Copy failed — select the text manually',
    'toast.historyLoaded': 'Loaded saved analysis: {name}',
    'toast.historySaved': 'Analysis saved',
    'toast.shareCopied': 'Share link copied to clipboard',
    'toast.shareCopyFallback': 'Copy this link:',
    'toast.shareLoaded': 'Loaded data from share link',
    'toast.shareLong': 'Share link is long — for big datasets, Saved Analyses works better',
    'toast.lastSessionRestored': 'Restored your last session',
  },
  pl: {
    'header.ready': 'SYSTEM GOTOWY',
    'header.pointsLoaded': '{n} WCZYTANYCH PUNKTÓW',
    'cfg.label': 'Konfiguracja',
    'cfg.apiKey': 'KLUCZ API ANTHROPIC',
    'cfg.remember': 'Zapamiętaj na tym urządzeniu (zapisywane tylko w tej przeglądarce)',
    'cfg.keyNote': 'Wysyłany bezpośrednio z Twojej przeglądarki do api.anthropic.com — nigdy nie trafia na żaden backend. Używaj klucza tylko na zaufanych urządzeniach.',
    'cfg.model': 'MODEL AI',
    'model.opus': 'Opus 5 — najwyższa jakość, wolniejszy',
    'model.sonnet': 'Sonnet 5 — zbalansowany (zalecany)',
    'model.haiku': 'Haiku 4.5 — najszybszy, najtańszy',
    'data.label': 'Dane wejściowe',
    'upload.title': 'Wgraj plik CSV',
    'upload.subtitle': 'Upuść dane pomiarów geodezyjnych',
    'csv.expected': 'Oczekiwane kolumny:',
    'csv.min': 'lat, lon, elevation (minimum)',
    'demo.btn': '⬡ Wczytaj dane demo (Portugalia)',
    'demo.siteLabel': 'Portugalia (dane demo)',
    'history.label': 'Zapisane analizy (ta przeglądarka)',
    'history.save': '💾 Zapisz bieżącą analizę',
    'history.empty': 'Brak zapisanych analiz',
    'history.promptName': 'Nazwij tę analizę:',
    'stats.label': 'Statystyki lokalizacji',
    'stat.points': 'Punkty pomiarowe',
    'stat.avgSlope': 'Śr. nachylenie °',
    'stat.avgAz': 'Śr. azymut °',
    'stat.avgElev': 'Śr. wysokość m',
    'stat.area': 'Szac. powierzchnia m²',
    'stat.rows': 'Szac. liczba rzędów',
    'stat.benchmark': 'vs typowa wydajność (~1500 kWh/kWp/rok)',
    'export.csv': '↓ CSV',
    'export.geojson': '↓ GeoJSON',
    'export.pdf': '🖨 Raport PDF',
    'export.share': '🔗 Link do udostępnienia',
    'charts.label': 'Wykresy lokalizacji',
    'charts.rating': 'Rozkład ocen',
    'charts.elevation': 'Profil wysokości',
    'charts.slope': 'Nachylenie wg punktu °',
    'charts.azimuth': 'Azymut vs optymalny',
    'charts.seasonal': 'Szac. wydajność miesięczna',
    'charts.empty': 'Za mało danych',
    'charts.compassAvg': 'Śr. azymut',
    'charts.compassOptimal': 'Optymalny',
    'rating.good': 'Dobra',
    'rating.mid': 'Średnia',
    'rating.bad': 'Słaba',
    'table.label': 'Punkty pomiarowe',
    'table.hash': '#',
    'table.lat': 'LAT',
    'table.lon': 'LON',
    'table.elev': 'WYS',
    'table.slope': 'NACH',
    'table.az': 'AZ',
    'table.rating': 'OCENA',
    'table.flags': 'FLAGI',
    'table.truncated': 'Wyświetlono pierwsze {shown} z {total} wierszy — pełne dane pobierz przez eksport CSV/GeoJSON',
    'map.awaiting': 'OCZEKIWANIE NA DANE',
    'map.uploadPrompt': 'WGRAJ CSV, ABY ROZPOCZĄĆ',
    'map.markers': 'Markery',
    'map.heatmap': 'Mapa cieplna',
    'map.site': 'LOKALIZACJA:',
    'map.tilt': 'OPTYMALNY KĄT:',
    'map.facing': 'KIERUNEK PANELI:',
    'map.yield': 'SZAC. WYDAJNOŚĆ:',
    'facing.south': 'Południe',
    'facing.north': 'Północ',
    'ai.title': 'Analiza AI lokalizacji',
    'ai.copy': '⎘ Kopiuj raport',
    'ai.analyze': 'Analizuj lokalizację →',
    'ai.analyzing': 'Analizowanie...',
    'ai.loading': 'Trwa analiza AI',
    'ai.pointsLoaded': 'Wczytano {n} punktów — kliknij „Analizuj lokalizację →”, aby uruchomić analizę AI',
    'ai.placeholder1': 'Oczekiwanie na dane geodezyjne',
    'ai.placeholder2': 'AI przeanalizuje nachylenie, azymut, lokalizację',
    'ai.placeholder3': 'Rekomendacje układu paneli PV',
    'ai.placeholder4': 'Szacowana roczna wydajność energetyczna',
    'ai.you': 'Ty',
    'chat.placeholder': 'Zadaj dodatkowe pytanie...',
    'chat.send': 'Wyślij',
    'toast.noKey': 'Wprowadź najpierw swój klucz API Anthropic',
    'toast.noData': 'Brak danych do analizy',
    'toast.analysisComplete': 'Analiza zakończona',
    'toast.analysisFailed': 'Analiza nie powiodła się: ',
    'toast.csvLoaded': 'Wczytano {n} punktów pomiarowych',
    'toast.csvError': 'Błąd CSV: ',
    'toast.demoLoaded': 'Wczytano dane demo — region Lizbony, Portugalia',
    'toast.csvExported': 'Wyeksportowano CSV',
    'toast.geojsonExported': 'Wyeksportowano GeoJSON',
    'toast.copySuccess': 'Raport skopiowany do schowka',
    'toast.copyFail': 'Kopiowanie nie powiodło się — zaznacz tekst ręcznie',
    'toast.historyLoaded': 'Wczytano zapisaną analizę: {name}',
    'toast.historySaved': 'Analiza zapisana',
    'toast.shareCopied': 'Link skopiowany do schowka',
    'toast.shareCopyFallback': 'Skopiuj ten link:',
    'toast.shareLoaded': 'Wczytano dane z linku',
    'toast.shareLong': 'Link jest długi — dla dużych zbiorów lepiej sprawdzi się zapis w Zapisanych analizach',
    'toast.lastSessionRestored': 'Przywrócono ostatnią sesję',
  },
};

function t(key, vars) {
  const dict = I18N[currentLang] || I18N.en;
  let str = dict[key] ?? I18N.en[key] ?? key;
  if (vars) Object.keys(vars).forEach(k => { str = str.replace(`{${k}}`, vars[k]); });
  return str;
}

function applyLanguage(lang) {
  currentLang = (lang === 'pl') ? 'pl' : 'en';
  try { localStorage.setItem(LANG_STORAGE, currentLang); } catch { /* ignore */ }
  document.documentElement.lang = currentLang;

  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
  });
  document.querySelectorAll('#lang-switch button').forEach(b => {
    b.classList.toggle('active', b.dataset.lang === currentLang);
  });

  renderHistoryList();

  if (currentData.length) renderData(currentData, { resetAI: false });
}

// ─── Globals ────────────────────────────────────────────────

let map = null;
let markerLayer = null;
let heatLayer = null;
let boundaryLayer = null;
let currentData = [];
let lastAiText = '';
let conversation = [];
let currentLang = 'en';
let currentMapView = 'markers';

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
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast ' + type;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 3500);
}

// ─── API key persistence (opt-in, this browser only) ──────
// Off by default. The key never leaves the browser except in the direct
// request to api.anthropic.com — storing it is purely a local convenience.

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

function formatLatLon(lat, lon) {
  return `${Math.abs(lat).toFixed(4)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(4)}°${lon >= 0 ? 'E' : 'W'}`;
}

// Relative monthly share of the annual yield, from solar declination + a
// simplified fixed-tilt incidence-angle model. A rough seasonal estimate,
// not a substitute for real irradiance data (TMY/PVGIS).
function seasonalYieldFactors(lat, tiltDeg) {
  const factors = [];
  for (let m = 0; m < 12; m++) {
    const dayOfYear = Math.round(30.44 * m + 15);
    const decl = 23.45 * Math.sin(2 * Math.PI * (284 + dayOfYear) / 365);
    const noonElevation = 90 - Math.abs(lat - decl);
    if (noonElevation <= 0) { factors.push(0); continue; }
    const incidence = Math.abs(lat - decl - (lat >= 0 ? tiltDeg : -tiltDeg));
    factors.push(Math.max(0, Math.cos(incidence * Math.PI / 180)));
  }
  const sum = factors.reduce((a, b) => a + b, 0) || 1;
  return factors.map(f => f / sum);
}

// Row spacing to avoid inter-row self-shading at solar noon near the winter
// solstice (standard rule-of-thumb design formula). Rough estimate — assumes
// a flat site and a fixed panel row height.
function estimateRowLayout(lat, tiltDeg) {
  const winterDecl = lat >= 0 ? -23.45 : 23.45;
  const minNoonElevation = 90 - Math.abs(lat - winterDecl);
  if (minNoonElevation <= 3) return { spacing: null, rows: null };
  const tiltRad = tiltDeg * Math.PI / 180;
  const elevRad = minNoonElevation * Math.PI / 180;
  const spacing = PANEL_ROW_HEIGHT_M * (Math.cos(tiltRad) + Math.sin(tiltRad) / Math.tan(elevRad));
  return { spacing, minNoonElevation };
}

function haversineM(p1, p2) {
  const R = 6371000;
  const phi1 = p1.lat * Math.PI / 180, phi2 = p2.lat * Math.PI / 180;
  const dPhi = (p2.lat - p1.lat) * Math.PI / 180;
  const dLambda = (p2.lon - p1.lon) * Math.PI / 180;
  const a = Math.sin(dPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function bearingDeg(p1, p2) {
  const phi1 = p1.lat * Math.PI / 180, phi2 = p2.lat * Math.PI / 180;
  const dLambda = (p2.lon - p1.lon) * Math.PI / 180;
  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
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

// Flags points whose elevation sits more than 2 standard deviations from
// the site mean — likely survey/measurement errors worth double-checking.
function detectOutliers(points) {
  const vals = points.map(p => p.elevation).filter(v => v != null);
  if (vals.length < 4) return points.map(() => false);
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
  const sd = Math.sqrt(variance);
  if (sd === 0) return points.map(() => false);
  return points.map(p => p.elevation != null && Math.abs(p.elevation - mean) > 2 * sd);
}

// Single source of truth for every derived number shown in the UI, and
// reused by the exports, the AI prompt, and the chart renderers.
function computeSiteStats(data) {
  const ratings = data.map(pt => solarRating(pt.lat, pt.slope, pt.azimuth));
  const counts = { good: 0, mid: 0, bad: 0 };
  ratings.forEach(r => counts[r]++);

  let totalSlope = 0, totalAz = 0, totalElev = 0, validSlope = 0, validAz = 0, validElev = 0;
  data.forEach(pt => {
    if (pt.slope     != null) { totalSlope += pt.slope;     validSlope++; }
    if (pt.azimuth   != null) { totalAz    += pt.azimuth;   validAz++; }
    if (pt.elevation != null) { totalElev  += pt.elevation; validElev++; }
  });
  const avgSlope = validSlope ? totalSlope / validSlope : null;
  const avgAz    = validAz    ? totalAz    / validAz    : null;
  const avgElev  = validElev  ? totalElev  / validElev  : null;

  const centerLat = data.reduce((s, p) => s + p.lat, 0) / data.length;
  const centerLon = data.reduce((s, p) => s + p.lon, 0) / data.length;

  const yieldEst  = estimateYield(centerLat, avgSlope, avgAz);
  const optTilt   = Math.abs(centerLat) * 0.9;
  const facingAz  = optimalAzimuth(centerLat);
  const facing    = facingAz === 180 ? 'S' : 'N';

  let hull = [], area;
  if (data.length >= 3) {
    hull = convexHull(data);
    area = Math.round(polygonAreaM2(hull, centerLat));
  } else {
    const lats = data.map(p => p.lat), lons = data.map(p => p.lon);
    const dLat = (Math.max(...lats) - Math.min(...lats)) * 111000;
    const dLon = (Math.max(...lons) - Math.min(...lons)) * 111000 * Math.cos(centerLat * Math.PI / 180);
    area = Math.round(dLat * dLon);
  }

  const layout = estimateRowLayout(centerLat, optTilt);
  let rows = null;
  if (layout.spacing) {
    const lats = data.map(p => p.lat);
    const depthM = (Math.max(...lats) - Math.min(...lats)) * 111000;
    rows = Math.max(1, Math.floor(depthM / layout.spacing) + 1);
  }

  const benchmarkPct = Math.round((yieldEst - BENCHMARK_YIELD_KWH) / BENCHMARK_YIELD_KWH * 100);
  const shadingFlags = detectShading(data, centerLat);
  const outlierFlags = detectOutliers(data);
  const seasonal = seasonalYieldFactors(centerLat, optTilt).map(f => Math.round(f * yieldEst));

  return {
    ratings, counts, avgSlope, avgAz, avgElev, centerLat, centerLon,
    yieldEst, optTilt, facing, facingAz, hull, area,
    spacing: layout.spacing, rows, benchmarkPct, shadingFlags, outlierFlags, seasonal,
  };
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

// ─── Charts (inline SVG, numeric data only — no user text is interpolated) ─

function chartRatingBar(counts) {
  const total = counts.good + counts.mid + counts.bad;
  if (!total) return `<div class="chart-empty">${t('charts.empty')}</div>`;
  const seg = (key, color) => {
    const pct = counts[key] / total * 100;
    return pct > 0 ? `<div style="flex:${pct.toFixed(2)};background:${color}"></div>` : '';
  };
  return `<div class="bar-chart">${seg('good', '#3ddc84')}${seg('mid', '#f0c040')}${seg('bad', '#ff5252')}</div>` +
    `<div class="bar-chart-legend">` +
    `<span><i style="background:#3ddc84"></i>${t('rating.good')} ${counts.good}</span>` +
    `<span><i style="background:#f0c040"></i>${t('rating.mid')} ${counts.mid}</span>` +
    `<span><i style="background:#ff5252"></i>${t('rating.bad')} ${counts.bad}</span>` +
    `</div>`;
}

function chartLineProfile(values) {
  if (values.length < 2) return `<div class="chart-empty">${t('charts.empty')}</div>`;
  const w = 260, h = 60, pad = 8;
  const min = Math.min(...values), max = Math.max(...values);
  const range = (max - min) || 1;
  const stepX = (w - 2 * pad) / (values.length - 1);
  const pts = values.map((v, i) => {
    const x = pad + i * stepX;
    const y = h - pad - ((v - min) / range) * (h - 2 * pad);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return `<svg class="site-chart-svg" viewBox="0 0 ${w} ${h}">` +
    `<polyline points="${pts}" fill="none" stroke="#f0c040" stroke-width="1.5"/>` +
    `<text x="${pad}" y="${h - 2}" font-size="8" fill="#6b7478">${min.toFixed(0)}m</text>` +
    `<text x="${w - pad}" y="${h - 2}" font-size="8" fill="#6b7478" text-anchor="end">${max.toFixed(0)}m</text>` +
    `</svg>`;
}

function chartBars(values, colors) {
  if (!values.length) return `<div class="chart-empty">${t('charts.empty')}</div>`;
  const w = 260, h = 60, pad = 4;
  const max = Math.max(...values, 1);
  const bw = (w - 2 * pad) / values.length;
  const bars = values.map((v, i) => {
    const bh = Math.max(1, (v / max) * (h - 2 * pad));
    const x = pad + i * bw;
    const y = h - pad - bh;
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(1, bw * 0.7).toFixed(1)}" height="${bh.toFixed(1)}" fill="${colors[i]}"/>`;
  }).join('');
  return `<svg class="site-chart-svg" viewBox="0 0 ${w} ${h}">${bars}</svg>`;
}

function chartCompass(avgAz, targetAz) {
  const size = 76, cx = 38, cy = 38, r = 28;
  const toXY = (deg) => {
    const rad = deg * Math.PI / 180;
    return [cx + r * Math.sin(rad), cy - r * Math.cos(rad)];
  };
  const labels = [['N', 0], ['E', 90], ['S', 180], ['W', 270]].map(([lab, deg]) => {
    const [x, y] = toXY(deg);
    return `<text x="${x.toFixed(1)}" y="${(y + 3).toFixed(1)}" font-size="8" fill="#6b7478" text-anchor="middle">${lab}</text>`;
  }).join('');
  let avgLine = '';
  if (avgAz != null) {
    const [x, y] = toXY(avgAz);
    avgLine = `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#f0c040" stroke-width="2"/>`;
  }
  const [tx, ty] = toXY(targetAz);
  const targetLine = `<line x1="${cx}" y1="${cy}" x2="${tx.toFixed(1)}" y2="${ty.toFixed(1)}" stroke="#3ddc84" stroke-width="1.5" stroke-dasharray="3 3"/>`;
  return `<svg class="site-chart-svg" viewBox="0 0 ${size} ${size}">` +
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#1e2529" stroke-width="1"/>` +
    labels + targetLine + avgLine +
    `<circle cx="${cx}" cy="${cy}" r="2" fill="#e8eaeb"/></svg>` +
    `<div class="bar-chart-legend">` +
    `<span><i style="background:#f0c040"></i>${t('charts.compassAvg')}</span>` +
    `<span><i style="background:#3ddc84"></i>${t('charts.compassOptimal')}</span>` +
    `</div>`;
}

function chartSeasonalBars(values) {
  if (!values || !values.length) return `<div class="chart-empty">${t('charts.empty')}</div>`;
  const months = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
  const w = 260, h = 64, pad = 6;
  const max = Math.max(...values, 1);
  const bw = (w - 2 * pad) / values.length;
  const bars = values.map((v, i) => {
    const bh = Math.max(1, (v / max) * (h - 2 * pad - 10));
    const x = pad + i * bw;
    const y = h - pad - 10 - bh;
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(1, bw * 0.65).toFixed(1)}" height="${bh.toFixed(1)}" fill="#f0c040"/>` +
      `<text x="${(x + bw * 0.35).toFixed(1)}" y="${h - 2}" font-size="7" fill="#6b7478" text-anchor="middle">${months[i]}</text>`;
  }).join('');
  return `<svg class="site-chart-svg" viewBox="0 0 ${w} ${h}">${bars}</svg>`;
}

function renderCharts(stats) {
  document.getElementById('chart-rating').innerHTML = chartRatingBar(stats.counts);
  document.getElementById('chart-elevation').innerHTML = chartLineProfile(currentData.map(p => p.elevation).filter(v => v != null));
  document.getElementById('chart-slope').innerHTML = chartBars(
    currentData.map(p => p.slope ?? 0),
    stats.ratings.map(r => r === 'good' ? '#3ddc84' : r === 'mid' ? '#f0c040' : '#ff5252'),
  );
  document.getElementById('chart-compass').innerHTML = chartCompass(stats.avgAz, stats.facingAz);
  document.getElementById('chart-seasonal').innerHTML = chartSeasonalBars(stats.seasonal);
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

// ─── Downloads ────────────────────────────────────────────

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Render data to map + sidebar ────────────────────────

function renderData(data, opts = {}) {
  const isNewDataset = opts.resetAI !== false;
  currentData = data;
  saveLastSession(data);

  if (isNewDataset) {
    conversation = [];
    lastAiText = '';
    document.getElementById('copy-report-btn').style.display = 'none';
    document.getElementById('ai-followup').style.display = 'none';
  }
  if (conversation.length === 0) {
    resetAiPanel(t('ai.pointsLoaded', { n: data.length }));
  }

  document.getElementById('map-empty').classList.add('hidden');
  document.getElementById('map-overlay').style.display = 'flex';
  document.getElementById('map-view-toggle').style.display = 'flex';
  document.getElementById('stats-section').style.display = 'block';
  document.getElementById('charts-section').style.display = 'block';
  document.getElementById('table-section').style.display = 'block';
  document.getElementById('analyze-btn').disabled = false;
  document.getElementById('save-history-btn').disabled = false;
  document.getElementById('export-csv-btn').style.display = '';
  document.getElementById('export-geojson-btn').style.display = '';
  document.getElementById('export-pdf-btn').style.display = '';
  document.getElementById('share-link-btn').style.display = '';

  if (markerLayer)   { map.removeLayer(markerLayer);   markerLayer = null; }
  if (heatLayer)     { map.removeLayer(heatLayer);     heatLayer = null; }
  if (boundaryLayer) { map.removeLayer(boundaryLayer); boundaryLayer = null; }

  const stats = computeSiteStats(data);

  const useCluster = data.length > CLUSTER_THRESHOLD;
  markerLayer = useCluster
    ? L.markerClusterGroup({
        maxClusterRadius: 60,
        iconCreateFunction: (cluster) => L.divIcon({
          html: `<div class="marker-cluster-custom" style="width:${Math.min(34 + cluster.getChildCount(), 64)}px;height:${Math.min(34 + cluster.getChildCount(), 64)}px">${cluster.getChildCount()}</div>`,
          className: '',
          iconSize: null,
        }),
      })
    : L.layerGroup();

  const bounds = [];
  data.forEach((pt, i) => {
    const rating = stats.ratings[i];
    const color  = rating === 'good' ? '#3ddc84' : rating === 'mid' ? '#f0c040' : '#ff5252';

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
    if (stats.shadingFlags[i]) {
      popup.appendChild(document.createElement('br'));
      const s = document.createElement('span');
      s.style.color = '#e07b20';
      s.textContent = '◐ Possible shading risk';
      popup.appendChild(s);
    }
    if (stats.outlierFlags[i]) {
      popup.appendChild(document.createElement('br'));
      const o = document.createElement('span');
      o.style.color = '#ff5252';
      o.textContent = '⚠ Elevation outlier';
      popup.appendChild(o);
    }

    const marker = L.marker([pt.lat, pt.lon], { icon }).bindPopup(popup);
    markerLayer.addLayer(marker);
    bounds.push([pt.lat, pt.lon]);
  });

  if (currentMapView === 'heatmap') {
    heatLayer = L.heatLayer(data.map(p => [p.lat, p.lon, 1]), { radius: 25, blur: 20, maxZoom: 17 }).addTo(map);
  } else {
    markerLayer.addTo(map);
  }

  if (bounds.length > 1) map.fitBounds(bounds, { padding: [40, 40] });
  else if (bounds.length === 1) map.setView(bounds[0], 17);

  if (stats.hull.length >= 3) {
    boundaryLayer = L.polygon(stats.hull.map(([lon, lat]) => [lat, lon]), {
      color: '#f0c040',
      weight: 1.5,
      dashArray: '4 4',
      fillColor: '#f0c040',
      fillOpacity: 0.06,
    }).addTo(map);
  }

  // Table — textContent only, no innerHTML; capped for very large datasets.
  const tbody = document.getElementById('table-body');
  tbody.innerHTML = '';
  const shownCount = Math.min(data.length, TABLE_ROW_CAP);
  for (let i = 0; i < shownCount; i++) {
    const pt = data[i];
    const rating = stats.ratings[i];
    const tr = tbody.insertRow();
    [i + 1, pt.lat.toFixed(4), pt.lon.toFixed(4), pt.elevation ?? '—', pt.slope ?? '—', pt.azimuth ?? '—']
      .forEach(val => { tr.insertCell().textContent = val; });
    const ratingCell = tr.insertCell();
    const tag = document.createElement('span');
    tag.className = `tag tag-${rating}`;
    tag.textContent = rating;
    ratingCell.appendChild(tag);

    const flagsCell = tr.insertCell();
    if (stats.shadingFlags[i]) {
      const s = document.createElement('span');
      s.className = 'flag-icon flag-shading';
      s.title = 'Possible shading risk (heuristic)';
      s.textContent = '◐';
      flagsCell.appendChild(s);
    }
    if (stats.outlierFlags[i]) {
      const o = document.createElement('span');
      o.className = 'flag-icon flag-outlier';
      o.title = 'Statistical elevation outlier';
      o.textContent = '⚠';
      flagsCell.appendChild(o);
    }
  }
  const truncNote = document.getElementById('table-truncated-note');
  if (data.length > TABLE_ROW_CAP) {
    truncNote.style.display = 'block';
    truncNote.textContent = t('table.truncated', { shown: TABLE_ROW_CAP, total: data.length });
  } else {
    truncNote.style.display = 'none';
  }

  document.getElementById('stat-points').textContent    = data.length;
  document.getElementById('stat-avg-slope').textContent = stats.avgSlope != null ? stats.avgSlope.toFixed(1) : '—';
  document.getElementById('stat-avg-az').textContent    = stats.avgAz    != null ? Math.round(stats.avgAz)   : '—';
  document.getElementById('stat-avg-elev').textContent  = stats.avgElev  != null ? stats.avgElev.toFixed(0)  : '—';
  document.getElementById('stat-area').textContent      = stats.area > 0 ? stats.area.toLocaleString() : '—';
  document.getElementById('stat-rows').textContent      = stats.rows ?? '—';

  const rowsCard = document.getElementById('stat-rows-card');
  rowsCard.title = stats.spacing
    ? `Row spacing ~${stats.spacing.toFixed(1)} m (avoids self-shading near winter-solstice noon; assumes ${PANEL_ROW_HEIGHT_M} m panel height) — rough estimate`
    : '';

  const benchEl = document.getElementById('stat-benchmark');
  benchEl.textContent = (stats.benchmarkPct >= 0 ? '+' : '') + stats.benchmarkPct + '%';
  benchEl.style.color = stats.benchmarkPct >= 0 ? 'var(--green)' : 'var(--red)';

  document.getElementById('badge-site').textContent = (data === DEMO_DATA)
    ? t('demo.siteLabel')
    : formatLatLon(stats.centerLat, stats.centerLon);
  document.getElementById('badge-tilt').textContent   = stats.optTilt.toFixed(0) + '°';
  document.getElementById('badge-facing').textContent = stats.facing === 'S' ? t('facing.south') : t('facing.north');
  document.getElementById('badge-yield').textContent  = stats.yieldEst.toLocaleString() + ' kWh/kWp/yr';
  document.getElementById('point-count').textContent  = t('header.pointsLoaded', { n: data.length });

  renderCharts(stats);
}

// ─── Map view toggle (markers / heatmap) ──────────────────

document.getElementById('map-view-toggle').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-view]');
  if (!btn || btn.dataset.view === currentMapView) return;
  currentMapView = btn.dataset.view;
  document.querySelectorAll('#map-view-toggle button').forEach(b => b.classList.toggle('active', b.dataset.view === currentMapView));
  if (!currentData.length) return;

  if (currentMapView === 'heatmap') {
    if (markerLayer) map.removeLayer(markerLayer);
    if (!heatLayer) heatLayer = L.heatLayer(currentData.map(p => [p.lat, p.lon, 1]), { radius: 25, blur: 20, maxZoom: 17 });
    heatLayer.addTo(map);
  } else {
    if (heatLayer) map.removeLayer(heatLayer);
    if (markerLayer) markerLayer.addTo(map);
  }
});

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

function systemPrompt() {
  const base = 'You are a solar energy site assessment expert with geodetic expertise. ' +
    'Analyze photovoltaic installation sites and provide structured technical reports ' +
    'with specific numerical recommendations. Be precise, use measurements, and keep ' +
    'each section to 2–4 sentences.';
  return currentLang === 'pl' ? base + ' Respond in Polish.' : base;
}

function buildInitialPrompt(stats) {
  const slopes     = currentData.filter(p => p.slope     != null).map(p => p.slope);
  const azimuths   = currentData.filter(p => p.azimuth   != null).map(p => p.azimuth);
  const elevations = currentData.filter(p => p.elevation != null).map(p => p.elevation);
  const avg = arr => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : 'N/A';
  const facingLabel = stats.facingAz === 180 ? 'south (180°)' : 'north (0°)';
  const headers = SECTION_HEADERS[currentLang] || SECTION_HEADERS.en;

  return `Analyze this photovoltaic installation site based on geodetic measurements:\n\n` +
    `LOCATION: ${formatLatLon(stats.centerLat, stats.centerLon)}\n` +
    `HEMISPHERE-OPTIMAL PANEL FACING: ${facingLabel}\n` +
    `MEASUREMENT POINTS: ${currentData.length}\n` +
    `AVERAGE SLOPE: ${avg(slopes)}°\n` +
    `SLOPE RANGE: ${slopes.length ? Math.min(...slopes).toFixed(1) + '° – ' + Math.max(...slopes).toFixed(1) + '°' : 'N/A'}\n` +
    `AVERAGE AZIMUTH: ${avg(azimuths)}°\n` +
    `ELEVATION RANGE: ${elevations.length ? Math.min(...elevations).toFixed(0) + ' – ' + Math.max(...elevations).toFixed(0) + ' m' : 'N/A'}\n` +
    `ESTIMATED ANNUAL YIELD (site tool estimate): ${stats.yieldEst} kWh/kWp/yr\n` +
    `SUGGESTED ROW COUNT (site tool estimate): ${stats.rows ?? 'N/A'}\n\n` +
    `Provide a structured analysis with these sections:\n\n` +
    headers.map(h => `### ${h}`).join('\n');
}

// ─── Analyze (streaming + prompt caching + follow-up chat) ─

async function streamMessage(userText, { append }) {
  const apiKey = document.getElementById('api-key').value.trim();
  if (!apiKey) { showToast(t('toast.noKey'), 'error'); return false; }
  const model = document.getElementById('model-select').value;

  conversation.push({ role: 'user', content: userText });

  const aiBody = document.getElementById('ai-body');
  if (append) {
    const turnEl = document.createElement('div');
    turnEl.className = 'ai-turn-user';
    const label = document.createElement('strong');
    label.textContent = t('ai.you') + ': ';
    const q = document.createElement('span');
    q.textContent = userText;
    turnEl.appendChild(label);
    turnEl.appendChild(q);
    aiBody.appendChild(turnEl);
  } else {
    aiBody.innerHTML = '';
    const loadingEl = document.createElement('div');
    loadingEl.className = 'loading-dots';
    loadingEl.textContent = t('ai.loading');
    aiBody.appendChild(loadingEl);
  }

  const responseEl = document.createElement('div');
  responseEl.className = 'ai-response';
  if (!append) aiBody.innerHTML = '';
  aiBody.appendChild(responseEl);
  aiBody.scrollTop = aiBody.scrollHeight;

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
        model,
        max_tokens: 1000,
        stream: true,
        system: [
          // Cache the static expert persona — reused across analyses
          { type: 'text', text: systemPrompt(), cache_control: { type: 'ephemeral' } },
        ],
        messages: conversation,
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

    conversation.push({ role: 'assistant', content: fullText });
    lastAiText = append ? (lastAiText + '\n\n---\n\n' + fullText) : fullText;
    document.getElementById('copy-report-btn').style.display = '';
    document.getElementById('ai-followup').style.display = 'flex';
    showToast(t('toast.analysisComplete'), 'success');
    return true;
  } catch (err) {
    conversation.pop(); // the optimistic user turn didn't get a reply — drop it
    if (!append) aiBody.innerHTML = '';
    const errEl = document.createElement('div');
    errEl.style.cssText = 'color:var(--red);font-size:12px;margin-top:8px';
    errEl.textContent = 'Error: ' + err.message;
    aiBody.appendChild(errEl);
    showToast(t('toast.analysisFailed') + err.message, 'error');
    return false;
  }
}

document.getElementById('analyze-btn').addEventListener('click', async () => {
  if (!currentData.length) { showToast(t('toast.noData'), 'error'); return; }
  const btn = document.getElementById('analyze-btn');
  btn.disabled = true;
  btn.textContent = t('ai.analyzing');
  document.getElementById('copy-report-btn').style.display = 'none';

  const stats = computeSiteStats(currentData);
  await streamMessage(buildInitialPrompt(stats), { append: false });

  btn.disabled = false;
  btn.textContent = t('ai.analyze');
});

document.getElementById('followup-btn').addEventListener('click', async () => {
  const input = document.getElementById('followup-input');
  const text = input.value.trim();
  if (!text) return;
  const btn = document.getElementById('followup-btn');
  btn.disabled = true;
  input.disabled = true;
  input.value = '';

  await streamMessage(text, { append: true });

  btn.disabled = false;
  input.disabled = false;
  input.focus();
});

document.getElementById('followup-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('followup-btn').click();
});

// ─── CSV upload ───────────────────────────────────────────

function handleFile(file) {
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const data = parseCSV(ev.target.result);
      renderData(data);
      showToast(t('toast.csvLoaded', { n: data.length }), 'success');
    } catch (err) {
      showToast(t('toast.csvError') + err.message, 'error');
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
  showToast(t('toast.demoLoaded'), 'success');
});

// ─── Export: CSV / GeoJSON / PDF / Share link ─────────────

document.getElementById('export-csv-btn').addEventListener('click', () => {
  if (!currentData.length) return;
  const stats = computeSiteStats(currentData);
  const header = 'lat,lon,elevation,slope,azimuth,rating,shading_risk,elevation_outlier';
  const rows = currentData.map((pt, i) =>
    [pt.lat, pt.lon, pt.elevation ?? '', pt.slope ?? '', pt.azimuth ?? '', stats.ratings[i], stats.shadingFlags[i], stats.outlierFlags[i]].join(',')
  );
  downloadBlob(new Blob([[header, ...rows].join('\n')], { type: 'text/csv' }), 'solar-site-analysis.csv');
  showToast(t('toast.csvExported'), 'success');
});

document.getElementById('export-geojson-btn').addEventListener('click', () => {
  if (!currentData.length) return;
  const stats = computeSiteStats(currentData);
  const features = currentData.map((pt, i) => ({
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
      properties: { name: 'site_boundary', area_m2: stats.area },
    });
  }
  const geojson = { type: 'FeatureCollection', features };
  downloadBlob(new Blob([JSON.stringify(geojson, null, 2)], { type: 'application/geo+json' }), 'solar-site-analysis.geojson');
  showToast(t('toast.geojsonExported'), 'success');
});

document.getElementById('export-pdf-btn').addEventListener('click', () => {
  if (!currentData.length) return;
  const stats = computeSiteStats(currentData);
  document.getElementById('print-meta').textContent =
    `${new Date().toLocaleString()} · ${currentData.length} pts · ${stats.optTilt.toFixed(0)}° tilt, facing ${stats.facing === 'S' ? 'South' : 'North'} · ${stats.yieldEst.toLocaleString()} kWh/kWp/yr`;
  window.print();
});

function b64encodeUnicode(str) {
  return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16))));
}

function b64decodeUnicode(str) {
  return decodeURIComponent(atob(str).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
}

function encodeShareData(data) {
  const compact = data.map(p => [p.lat, p.lon, p.elevation, p.slope, p.azimuth]);
  return b64encodeUnicode(JSON.stringify(compact)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeShareData(urlSafeB64) {
  let b64 = urlSafeB64.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  const compact = JSON.parse(b64decodeUnicode(b64));
  return compact
    .map(([lat, lon, elevation, slope, azimuth]) => ({ lat, lon, elevation, slope, azimuth }))
    .filter(p =>
      typeof p.lat === 'number' && p.lat >= -90 && p.lat <= 90 &&
      typeof p.lon === 'number' && p.lon >= -180 && p.lon <= 180 &&
      (p.elevation == null || (p.elevation >= -500 && p.elevation <= 9000)) &&
      (p.slope     == null || (p.slope     >= 0    && p.slope     <= 90)) &&
      (p.azimuth   == null || (p.azimuth   >= 0    && p.azimuth   <= 360))
    );
}

document.getElementById('share-link-btn').addEventListener('click', async () => {
  if (!currentData.length) return;
  const url = `${location.origin}${location.pathname}#s=${encodeShareData(currentData)}`;
  if (currentData.length > 300) showToast(t('toast.shareLong'), '');
  try {
    await navigator.clipboard.writeText(url);
    showToast(t('toast.shareCopied'), 'success');
  } catch {
    window.prompt(t('toast.shareCopyFallback'), url);
  }
});

// ─── History (named local saves) ──────────────────────────

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_STORAGE) || '[]'); } catch { return []; }
}

function saveHistoryList(list) {
  try { localStorage.setItem(HISTORY_STORAGE, JSON.stringify(list.slice(0, HISTORY_LIMIT))); } catch { /* ignore */ }
}

function renderHistoryList() {
  const list = loadHistory();
  const container = document.getElementById('history-list');
  container.innerHTML = '';

  if (!list.length) {
    const empty = document.createElement('div');
    empty.className = 'history-empty';
    empty.textContent = t('history.empty');
    container.appendChild(empty);
    return;
  }

  list.forEach(entry => {
    const row = document.createElement('div');
    row.className = 'history-item';

    const main = document.createElement('div');
    main.className = 'history-item-main';
    const name = document.createElement('div');
    name.className = 'history-item-name';
    name.textContent = entry.name;
    const meta = document.createElement('div');
    meta.className = 'history-item-meta';
    meta.textContent = `${entry.data.length} pts · ${new Date(entry.savedAt).toLocaleDateString()}`;
    main.appendChild(name);
    main.appendChild(meta);
    main.addEventListener('click', () => {
      renderData(entry.data);
      showToast(t('toast.historyLoaded', { name: entry.name }), 'success');
    });

    const del = document.createElement('button');
    del.className = 'history-item-delete';
    del.textContent = '×';
    del.title = 'Delete';
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      saveHistoryList(loadHistory().filter(x => x.id !== entry.id));
      renderHistoryList();
    });

    row.appendChild(main);
    row.appendChild(del);
    container.appendChild(row);
  });
}

document.getElementById('save-history-btn').addEventListener('click', () => {
  if (!currentData.length) return;
  const name = window.prompt(t('history.promptName'), `Site ${new Date().toLocaleDateString()}`);
  if (!name) return;
  const list = loadHistory();
  list.unshift({ id: Date.now().toString(36), name: name.slice(0, 60), savedAt: Date.now(), data: currentData });
  saveHistoryList(list);
  renderHistoryList();
  showToast(t('toast.historySaved'), 'success');
});

// ─── Last-session auto-restore ────────────────────────────

function saveLastSession(data) {
  try { localStorage.setItem(LAST_SESSION_STORAGE, JSON.stringify(data)); } catch { /* ignore */ }
}

function loadLastSession() {
  try {
    const raw = localStorage.getItem(LAST_SESSION_STORAGE);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

// ─── Language switch ───────────────────────────────────────

document.getElementById('lang-switch').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-lang]');
  if (btn) applyLanguage(btn.dataset.lang);
});

// ─── Copy AI report ───────────────────────────────────────

document.getElementById('copy-report-btn').addEventListener('click', async () => {
  if (!lastAiText) return;
  try {
    await navigator.clipboard.writeText(lastAiText);
    showToast(t('toast.copySuccess'), 'success');
  } catch {
    showToast(t('toast.copyFail'), 'error');
  }
});

// ─── Init ───────────────────────────────────────────────────

const initialLang = (() => {
  try {
    const saved = localStorage.getItem(LANG_STORAGE);
    return (saved === 'pl' || saved === 'en') ? saved : 'en';
  } catch { return 'en'; }
})();
applyLanguage(initialLang);

(function bootstrapData() {
  if (location.hash.startsWith('#s=')) {
    try {
      const data = decodeShareData(location.hash.slice(3));
      if (data.length) {
        renderData(data);
        showToast(t('toast.shareLoaded'), 'success');
        return;
      }
    } catch (e) { console.warn('[Solar Site] Failed to load share link:', e); }
  }
  const last = loadLastSession();
  if (last && last.length) {
    renderData(last);
    showToast(t('toast.lastSessionRestored'), 'success');
  }
})();
