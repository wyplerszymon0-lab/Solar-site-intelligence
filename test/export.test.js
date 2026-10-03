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
