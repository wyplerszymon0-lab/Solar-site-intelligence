// Run with: node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const Csv = require('../csv.js');

test('quoted fields preserve commas and escaped quotes', () => {
  assert.deepEqual(Csv.parseCSVLine('"name,site","say ""Hi"""'), ['name,site', 'say "Hi"']);
});

test('lng and altitude headers map to longitude and elevation', () => {
  const result = Csv.parseCSV('latitude,lng,altitude,slope,azimuth\n38.7,-9.1,145,12,175');
  assert.deepEqual(result.points, [
    { lat: 38.7, lon: -9.1, elevation: 145, slope: 12, azimuth: 175 },
  ]);
  assert.deepEqual(result.rowErrors, []);
});

test('out-of-range rows are returned while valid rows remain', () => {
  const text = 'lat,lon,elevation,slope,azimuth\n38,-9,100,10,180\n91,-9,100,10,180\n38,-181,100,10,180';
  const result = Csv.parseCSV(text);
  assert.equal(result.points.length, 1);
  assert.equal(result.rowErrors.length, 2);
  assert.match(result.rowErrors[0], /^Row 3: lat must/);
  assert.match(result.rowErrors[1], /^Row 4: lon must/);
});

test('all invalid rows are returned without browser side effects', () => {
  const result = Csv.parseCSV('lat,lon\n91,0');
  assert.deepEqual(result.points, []);
  assert.match(result.rowErrors[0], /^Row 2: lat must/);
});

test('empty input needs a header and data row', () => {
  assert.throws(() => Csv.parseCSV(''), /header row and at least one data row/);
  assert.throws(() => Csv.parseCSV('lat,lon\n'), /header row and at least one data row/);
});

test('browser script exposes the same parser API', () => {
  const { readFileSync } = require('node:fs');
  const { runInNewContext } = require('node:vm');
  const window = {};
  runInNewContext(readFileSync(require.resolve('../csv.js'), 'utf8'), { window });
  assert.equal(typeof window.CsvParser.parseCSVLine, 'function');
  assert.equal(window.CsvParser.parseCSV('lat,lon\n1,2').points[0].lat, 1);
});
