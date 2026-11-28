// Run with: node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const { yieldSourceId, buildGeoJSON, monthlyYieldTableHTML } = require('../export.js');

const MONTHLY = [52, 71, 118, 142, 165, 171, 182, 170, 137, 101, 60, 45];

const data = [
  { lat: 38.70, lon: -9.10, elevation: 100, slope: 30, azimuth: 180 },
  { lat: 38.70, lon: -9.09, elevation: 102, slope: 31, azimuth: 178 },
  { lat: 38.71, lon: -9.09, elevation: 105, slope: 29, azimuth: 182 },
];

const stats = (overrides = {}) => ({
  ratings: ['good', 'good', 'mid'],
  shadingFlags: [false, false, true],
  outlierFlags: [false, false, false],
  hull: [[-9.10, 38.70], [-9.09, 38.70], [-9.09, 38.71]],
  area: 960,
  yieldEst: 1414,
  seasonal: MONTHLY,
  yieldSource: 'satellite',
  systemLossPct: 14,
  ground: { surface: 'grass', albedo: 0.2 },
  climFetchedAt: '2026-10-03T08:15:00.000Z',
  climPeriod: { first: 2001, last: 2025, years: 25, fromSeries: true },
  ...overrides,
});

test('site boundary carries annual and monthly yield with its source', () => {
  const { features } = buildGeoJSON(data, stats());
  const boundary = features.find(f => f.properties.name === 'site_boundary');
  assert.deepEqual(boundary.properties, {
    name: 'site_boundary',
    area_m2: 960,
    yield_annual_kwh_per_kwp: 1414,
    yield_monthly_kwh_per_kwp: MONTHLY,
    yield_source: 'nasa_power',
    yield_data_retrieved: '2026-10-03',
    yield_data_years: '2001-2025',
    system_loss_pct: 14,
    ground_albedo: 0.2,
    ground_surface: 'grass',
    capacity_kwp: null,
    ground_coverage_ratio: null,
    row_grade_pct: null,
    capacity_flat_kwp: null,
    energy_mwh_per_year_p50: null,
    energy_mwh_per_year_p90: null,
    tracker_yield_kwh_per_kwp: null,
    tracker_gain_pct: null,
    tracker_gcr: null,
    tracker_rotation_limit_deg: null,
    tracker_capacity_kwp: null,
    tracker_energy_mwh_per_year: null,
    bifacial_yield_kwh_per_kwp: null,
    bifacial_gain_pct: null,
    bifaciality: null,
    bifacial_p50_kwh_per_kwp: null,
    bifacial_p90_kwh_per_kwp: null,
    bifacial_energy_mwh_per_year_p50: null,
    bifacial_energy_mwh_per_year_p90: null,
    terrain_slope_deg: null,
    terrain_aspect_deg: null,
    terrain_grade_north_pct: null,
    terrain_grade_east_pct: null,
    terrain_rms_m: null,
  });
  assert.equal(boundary.properties.yield_monthly_kwh_per_kwp.length, 12);
});

test('boundary ring is closed and uses [lon, lat] order', () => {
  const { features } = buildGeoJSON(data, stats());
  const ring = features.at(-1).geometry.coordinates[0];
  assert.deepEqual(ring[0], [-9.10, 38.70]);
  assert.deepEqual(ring.at(-1), ring[0]);
});

test('points keep their per-point properties unchanged', () => {
  const { type, features } = buildGeoJSON(data, stats());
  assert.equal(type, 'FeatureCollection');
  assert.equal(features.length, 4); // 3 points + boundary
  assert.deepEqual(features[2].properties, {
    id: 3, elevation: 105, slope: 29, azimuth: 182,
    rating: 'mid', shading_risk: true, elevation_outlier: false,
  });
  assert.deepEqual(features[0].geometry.coordinates, [-9.10, 38.70]);
});

test('yield made by the fallback formula is labelled heuristic, also while loading', () => {
  assert.equal(yieldSourceId('satellite'), 'nasa_power');
  assert.equal(yieldSourceId('heuristic'), 'heuristic');
  assert.equal(yieldSourceId('loading'), 'heuristic');
  const { features } = buildGeoJSON(data, stats({ yieldSource: 'loading' }));
  assert.equal(features.at(-1).properties.yield_source, 'heuristic');
});

test('exported monthly values are a copy, not the live stats array', () => {
  const s = stats();
  const { features } = buildGeoJSON(data, s);
  features.at(-1).properties.yield_monthly_kwh_per_kwp[0] = -1;
  assert.equal(s.seasonal[0], 52);
});

test('fewer than 3 points: no boundary feature', () => {
  const { features } = buildGeoJSON(data.slice(0, 2), stats({ hull: [] }));
  assert.equal(features.length, 2);
  assert.ok(features.every(f => f.geometry.type === 'Point'));
});

test('print table lists 12 month labels and 12 rounded values', () => {
  const months = 'Jan,Feb,Mar,Apr,May,Jun,Jul,Aug,Sep,Oct,Nov,Dec'.split(',');
  const html = monthlyYieldTableHTML([1234.6, ...MONTHLY.slice(1)], months, 'Monthly yield');
  assert.equal((html.match(/<th>/g) || []).length, 12);
  assert.equal((html.match(/<td>/g) || []).length, 12);
  assert.match(html, /<th>Jan<\/th>.*<th>Dec<\/th>/);
  assert.match(html, /<td>1,235<\/td><td>71<\/td>/);
  assert.match(html, /<caption>Monthly yield<\/caption>/);
});

test('print table escapes its labels', () => {
  const html = monthlyYieldTableHTML([1], ['<b>'], 'a & b');
  assert.match(html, /<th>&#60;b&#62;<\/th>/);
  assert.match(html, /<caption>a &#38; b<\/caption>/);
});

test('retrieval date is exported only for satellite data', () => {
  const heuristic = buildGeoJSON(data, stats({ yieldSource: 'heuristic' }));
  assert.equal(heuristic.features.at(-1).properties.yield_data_retrieved, null);
  const legacy = buildGeoJSON(data, stats({ climFetchedAt: null })); // cached before timestamps
  assert.equal(legacy.features.at(-1).properties.yield_data_retrieved, null);
});

test("the whole site's capacity and energy are exported, rounded", () => {
  const capacity = { kWp: 66543.2, gcr: 0.30812, mwhP50: 69402.6, mwhP90: 64211.4 };
  const p = buildGeoJSON(data, stats({ capacity })).features.at(-1).properties;
  assert.deepEqual([p.capacity_kwp, p.ground_coverage_ratio, p.energy_mwh_per_year_p50, p.energy_mwh_per_year_p90],
    [66543, 0.308, 69403, 64211]);
  const noP90 = buildGeoJSON(data, stats({ capacity: { ...capacity, mwhP90: null } })).features.at(-1).properties;
  assert.equal(noP90.energy_mwh_per_year_p90, null);
  const sloping = buildGeoJSON(data, stats({ capacity: { ...capacity, gradePct: 5.0312, flatKWp: 55432.1 } })).features.at(-1).properties;
  assert.deepEqual([sloping.row_grade_pct, sloping.capacity_flat_kwp], [5.03, 55432]);
  const flat = buildGeoJSON(data, stats({ capacity: { ...capacity, gradePct: null, flatKWp: 66543.2 } })).features.at(-1).properties;
  assert.deepEqual([flat.row_grade_pct, flat.capacity_flat_kwp], [null, 66543]);
});

test('the tracker alternative is exported only next to satellite yield', () => {
  const tracker = { yield: 1757, gainPct: 21.4, uncertaintyPct: 5.6 };
  const p = buildGeoJSON(data, stats({ tracker })).features.at(-1).properties;
  assert.deepEqual([p.tracker_yield_kwh_per_kwp, p.tracker_gain_pct], [1757, 21.4]);
  const heuristic = buildGeoJSON(data, stats({ tracker, yieldSource: 'heuristic' })).features.at(-1).properties;
  assert.deepEqual([heuristic.tracker_yield_kwh_per_kwp, heuristic.tracker_gain_pct], [null, null]);
});

test('the tracker layout: GCR, rotation limit, capacity and energy, rounded', () => {
  const tracker = { yield: 1140, gainPct: 9.1, gcr: 0.33, limit: 60, capacity: { kWp: 3456.7, mwh: 3940.6 } };
  const p = buildGeoJSON(data, stats({ tracker })).features.at(-1).properties;
  assert.deepEqual([p.tracker_gcr, p.tracker_rotation_limit_deg, p.tracker_capacity_kwp, p.tracker_energy_mwh_per_year],
    [0.33, 60, 3457, 3941]);
  const free = buildGeoJSON(data, stats({ tracker: { ...tracker, limit: null, capacity: undefined } })).features.at(-1).properties;
  assert.deepEqual([free.tracker_rotation_limit_deg, free.tracker_capacity_kwp, free.tracker_energy_mwh_per_year], [null, null, null]);
});

test('the bifacial alternative is exported when it is set', () => {
  const bifacial = { yield: 1721, gainPct: 8, rear: 198, ratioPct: 10.2, bifaciality: 0.8 };
  const p = buildGeoJSON(data, stats({ bifacial })).features.at(-1).properties;
  assert.deepEqual([p.bifacial_yield_kwh_per_kwp, p.bifacial_gain_pct, p.bifaciality], [1721, 8, 0.8]);
  assert.deepEqual([p.bifacial_p50_kwh_per_kwp, p.bifacial_energy_mwh_per_year_p50], [null, null]);
  // With the yearly series and a row layout (issue #69): P50/P90 per kWp and for the site.
  const full = { ...bifacial, variability: { p50: 1719, p90Year: 1602, p90LongTerm: 1650 }, mwhP50: 5943.6, mwhP90: 5538.4 };
  const q = buildGeoJSON(data, stats({ bifacial: full })).features.at(-1).properties;
  assert.deepEqual([q.bifacial_p50_kwh_per_kwp, q.bifacial_p90_kwh_per_kwp, q.bifacial_energy_mwh_per_year_p50, q.bifacial_energy_mwh_per_year_p90],
    [1719, 1602, 5944, 5538]);
});

test('the terrain plane is exported rounded, with no aspect on level ground', () => {
  const terrain = { slopeDeg: 3.33928, aspectDeg: 329.1385, gradeNorthPct: -4.99581, gradeEastPct: 2.98031, rmsM: 0.47325, n: 49 };
  const p = buildGeoJSON(data, stats({ terrain })).features.at(-1).properties;
  assert.deepEqual([p.terrain_slope_deg, p.terrain_aspect_deg, p.terrain_grade_north_pct, p.terrain_grade_east_pct, p.terrain_rms_m],
    [3.34, 329.1, -5, 2.98, 0.473]);
  const level = buildGeoJSON(data, stats({ terrain: { ...terrain, slopeDeg: 0, aspectDeg: null } })).features.at(-1).properties;
  assert.deepEqual([level.terrain_slope_deg, level.terrain_aspect_deg], [0, null]);
});

test('the years behind the yield are exported only for satellite data', () => {
  const props = (o) => buildGeoJSON(data, stats(o)).features.at(-1).properties.yield_data_years;
  assert.equal(props({ climPeriod: { first: 2001, last: 2020, fromSeries: false } }), '2001-2020'); // NASA's climatology
  assert.equal(props({ yieldSource: 'heuristic' }), null);
  assert.equal(props({ climPeriod: null }), null);
});
