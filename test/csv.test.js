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
  assert.throws(() => parseCSV('x,y\n1,2\n'), /"lat" and "lon"/);
  assert.throws(() => parseCSV('lat,lon\n999,2\n'), /No valid data rows/);
});
