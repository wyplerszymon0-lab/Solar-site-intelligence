// Run with: node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const { getCRS, projectedToLatLon } = require('../crs.js');
const reference = require('./fixtures/crs-proj.json');

// PROJ's values are rounded to 0.1 mm; 1e-8° is about 1 mm on the ground.
test('forward and inverse agree with PROJ to a millimetre in every system', () => {
  assert.ok(reference.cases.length >= 20);
  for (const c of reference.cases) {
    const crs = getCRS(c.crs);
    const p = crs.toProjected(c.lat, c.lon);
    assert.ok(Math.abs(p.easting - c.easting) < 1e-3 && Math.abs(p.northing - c.northing) < 1e-3,
      `${c.crs} ${c.name}: forward off by ${p.easting - c.easting}, ${p.northing - c.northing} m`);
    const q = crs.toLatLon(c.easting, c.northing);
    assert.ok(Math.abs(q.lat - c.lat) < 1e-8 && Math.abs(q.lon - c.lon) < 1e-8,
      `${c.crs} ${c.name}: inverse off by ${q.lat - c.lat}, ${q.lon - c.lon}°`);
  }
});

test('the reference covers both hemispheres, every Polish grid and Portugal', () => {
  const ids = new Set(reference.cases.map(c => c.crs));
  for (const id of ['pl1992', 'pl2000:5', 'pl2000:6', 'pl2000:7', 'pl2000:8', 'pttm06', 'utm:56S', 'utm:17S']) {
    assert.ok(ids.has(id), id);
  }
});

test('round trip stays put far from the central meridian and near the poles', () => {
  const crs = getCRS('utm:33N');
  for (const [lat, lon] of [[0, 15], [45, 21], [80, 9], [10, 7.5]]) {
    const { easting, northing } = crs.toProjected(lat, lon);
    const back = crs.toLatLon(easting, northing);
    assert.ok(Math.abs(back.lat - lat) < 1e-9 && Math.abs(back.lon - lon) < 1e-9, `${lat}, ${lon}`);
  }
});

test('zone parameters follow the definitions', () => {
  assert.equal(getCRS('utm:1N').lon0, -177);
  assert.equal(getCRS('utm:60S').lon0, 177);
  assert.equal(getCRS('utm:60S').falseNorthing, 10000000);
  assert.equal(getCRS('pl2000:6').falseEasting, 6500000);
  assert.equal(getCRS('pl1992').xIsNorthing, true);
  assert.equal(getCRS('utm:34N').xIsNorthing, false);
  for (const bad of ['utm:0N', 'utm:61N', 'utm:34X', 'pl2000:4', 'epsg:4326', '', undefined]) {
    assert.throws(() => getCRS(bad), /Unknown coordinate system/, String(bad));
  }
});

test('implausible coordinates are refused instead of landing somewhere else', () => {
  const pl = getCRS('pl2000:7');
  // A PL-2000 zone 6 easting read as zone 7: 1000 km off, refused.
  assert.throws(() => projectedToLatLon(pl, 6500000, 5700000), /wrong zone/);
  assert.throws(() => projectedToLatLon(getCRS('utm:34N'), 500000, 9900000), /outside UTM zone 34N/);
  assert.throws(() => projectedToLatLon(pl, NaN, 5700000), /central meridian/);
});
