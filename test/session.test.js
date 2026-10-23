// Run with: node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const { forgetSession, LAST_SESSION_KEY, KEPT_KEYS } = require('../session.js');

function fakeStorage(entries) {
  const map = new Map(Object.entries(entries));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    keys: () => [...map.keys()].sort(),
  };
}

function fakeLocation(hash) {
  const calls = [];
  return {
    loc: { hash, pathname: '/Solar-site-intelligence/', search: '?lang=pl' },
    hist: { replaceState: (...args) => calls.push(args) },
    calls,
  };
}

test('clear forgets the restored dataset but keeps settings and saved analyses', () => {
  const kept = Object.fromEntries(KEPT_KEYS.map((k) => [k, 'x']));
  const storage = fakeStorage({ [LAST_SESSION_KEY]: '[{"lat":1}]', ...kept });
  const { loc, hist, calls } = fakeLocation('');
  assert.deepEqual(forgetSession(storage, loc, hist), { removedSession: true, clearedShareLink: false });
  assert.deepEqual(storage.keys(), [...KEPT_KEYS].sort());
  assert.equal(calls.length, 0);
});

test('a share link in the URL is dropped so a reload does not load it again', () => {
  const storage = fakeStorage({});
  const { loc, hist, calls } = fakeLocation('#s=eyJhIjoxfQ');
  assert.deepEqual(forgetSession(storage, loc, hist), { removedSession: false, clearedShareLink: true });
  assert.deepEqual(calls, [[null, '', '/Solar-site-intelligence/?lang=pl']]);
});

test('blocked storage (private mode) does not stop the reset', () => {
  const throwing = { getItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } };
  const { loc, hist } = fakeLocation('#s=abc');
  assert.deepEqual(forgetSession(throwing, loc, hist), { removedSession: false, clearedShareLink: true });
});
