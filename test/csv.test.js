// Run with: node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCSV, parseCSVLine } = require('../csv.js');

test('parses the documented format', () => {
  const { points, rowErrors } = parseCSV('lat,lon,elevation,slope,azimuth\n38.7223,-9.1393,145,12,175\n');
  assert.deepEqual(points, [{ lat: 38.7223, lon: -9.1393, elevation: 145, slope: 12, azimuth: 175 }]);
  assert.deepEqual(rowErrors, []);
});

test('quoted fields keep commas and escaped quotes', () => {
  assert.deepEqual(parseCSVLine('"a,b","say ""hi""", c '), ['a,b', 'say "hi"', 'c']);
});

test('semicolon files with decimal commas (European Excel) parse correctly', () => {
  const { points } = parseCSV('lat;lon;elevation\r\n38,7223;-9,1393;145\r\n');
  assert.deepEqual(points, [{ lat: 38.7223, lon: -9.1393, elevation: 145, slope: null, azimuth: null }]);
});

test('header aliases, a UTF-8 BOM and extra columns are accepted', () => {
  const csv = '﻿Point ID,Latitude,Longitude,Altitude,Tilt,Bearing\nP1,52.23,21.01,100,35,180\n';
  const { points } = parseCSV(csv);
  assert.deepEqual(points, [{ lat: 52.23, lon: 21.01, elevation: 100, slope: 35, azimuth: 180 }]);
  assert.equal(parseCSV('lat,lng\n1,2\n').points[0].lon, 2);
});

test('optional columns may be missing or empty', () => {
  const { points } = parseCSV('lat,lon,elevation\n1,2,\n3,4,5\n');
  assert.deepEqual(points.map(p => p.elevation), [null, 5]);
});

test('invalid rows are reported with their row number and the rest is kept', () => {
  const csv = 'lat,lon,slope\n1,2,10\n95,2,10\n1,2,91\n1,2,12abc\n\n3,4,20\n';
  const { points, rowErrors } = parseCSV(csv);
  assert.equal(points.length, 2);
  assert.equal(rowErrors.length, 3);
  assert.match(rowErrors[0], /^Row 3: lat/);
  assert.match(rowErrors[1], /^Row 4: slope/);
  assert.match(rowErrors[2], /^Row 5: slope .*12abc/); // not silently read as 12
});

test('files that cannot be used at all throw', () => {
  assert.throws(() => parseCSV(''), /header row/);
  assert.throws(() => parseCSV('lat,lon\n'), /header row/);
  assert.throws(() => parseCSV('a,b\n1,2\n'), /"lat" and "lon"/);
  assert.throws(() => parseCSV('x,y\n1,2\n'), /choose its coordinate system/); // plane coordinates need a system
  assert.throws(() => parseCSV('lat,lon\n999,2\n'), /No valid data rows/);
});

// Warsaw (52.2297 N, 21.0122 E) in three systems, values from PROJ (test/fixtures/crs-proj.json).
test('easting/northing columns are converted with the chosen system', () => {
  const near = (p, lat, lon) => Math.abs(p.lat - lat) < 1e-8 && Math.abs(p.lon - lon) < 1e-8;
  const utm = parseCSV('easting,northing,elevation\n500833.2431,5786586.6712,100\n', { crs: 'utm:34N' });
  assert.ok(near(utm.points[0], 52.2297, 21.0122));
  assert.equal(utm.points[0].elevation, 100);
  // Semicolons and decimal commas work for plane coordinates too.
  const e = parseCSV('E;N\n500833,2431;5786586,6712\n', { crs: 'utm:34N' });
  assert.ok(near(e.points[0], 52.2297, 21.0122));
});

test('in the Polish grids x is northing and y is easting; elsewhere x is easting', () => {
  const { getCRS } = require('../crs.js');
  const { easting, northing } = getCRS('pl2000:7').toProjected(52.2297, 21.0122);
  const pl = parseCSV(`x,y\n${northing},${easting}\n`, { crs: 'pl2000:7' });
  assert.ok(Math.abs(pl.points[0].lat - 52.2297) < 1e-8 && Math.abs(pl.points[0].lon - 21.0122) < 1e-8);
  const utm = parseCSV('x,y\n500833.2431,5786586.6712\n', { crs: 'utm:34N' });
  assert.ok(Math.abs(utm.points[0].lat - 52.2297) < 1e-8);
});

test('swapped axes or a wrong zone are row errors that say why', () => {
  // Easting and northing swapped: 5 786 km east of the central meridian.
  const { points, rowErrors } = parseCSV(
    'easting,northing\n500833.2431,5786586.6712\n5786586.6712,500833.2431\n', { crs: 'utm:34N' });
  assert.equal(points.length, 1);
  assert.match(rowErrors[0], /^Row 3: easting 5786586\.6712 is 5289 km from the central meridian.*swapped/);
});

test('lat/lon columns win over a chosen system', () => {
  const { points } = parseCSV('lat,lon,x,y\n38.7,-9.1,1,2\n', { crs: 'utm:29N' });
  assert.deepEqual([points[0].lat, points[0].lon], [38.7, -9.1]);
});
