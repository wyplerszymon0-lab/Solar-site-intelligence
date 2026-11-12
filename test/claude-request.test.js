// Run with: node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const R = require('../claude-request.js');

const messages = [{ role: 'user', content: 'Site report, please.' }];

test('the current generation, with Sonnet 5.5 as the default', () => {
  assert.deepEqual(R.MODELS.map(m => m.id), ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5']);
  assert.equal(R.DEFAULT_MODEL, 'claude-sonnet-5-5');
});

test('the Configuration select offers exactly these models, the default selected', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const select = html.slice(html.indexOf('<select id="model-select">'), html.indexOf('</select>', html.indexOf('<select id="model-select">')));
  const options = [...select.matchAll(/<option value="([^"]+)"([^>]*)>/g)];
  assert.deepEqual(options.map(o => o[1]), R.MODELS.map(m => m.id));
  assert.deepEqual(options.filter(o => /\bselected\b/.test(o[2])).map(o => o[1]), [R.DEFAULT_MODEL]);
});

test('a direct request streams the system prompt and the conversation as given', () => {
  const { url, headers, body } = R.directRequest('sk-test', 'claude-sonnet-5-5', 'system text', messages);
  assert.equal(url, 'https://api.anthropic.com/v1/messages');
  assert.equal(headers['x-api-key'], 'sk-test');
  assert.equal(headers['anthropic-dangerous-direct-browser-access'], 'true');
  assert.equal(body.model, 'claude-sonnet-5-5');
  assert.equal(body.stream, true);
  assert.equal(body.system, 'system text');
  assert.equal(body.messages, messages);
  assert.equal(body.max_tokens, 16000);
});

test('no field these models reject: no thinking config, no sampling parameters', () => {
  for (const { id } of R.MODELS) {
    const { body } = R.directRequest('k', id, 's', messages);
    for (const field of ['thinking', 'temperature', 'top_p', 'top_k', 'budget_tokens', 'tool_choice']) {
      assert.ok(!(field in body), `${id} sends ${field}`);
    }
  }
});

test('the refusal fallback goes only to the models that support it', () => {
  for (const id of ['claude-opus-5-5', 'claude-sonnet-5-5']) {
    const { headers, body } = R.directRequest('k', id, 's', messages);
    assert.equal(headers['anthropic-beta'], 'server-side-fallback-2026-07-01', id);
    assert.equal(body.fallbacks, 'default', id);
  }
  const haiku = R.directRequest('k', 'claude-haiku-5-5', 's', messages);
  assert.ok(!('anthropic-beta' in haiku.headers));
  assert.ok(!('fallbacks' in haiku.body));
});

test('an unknown or retired model id is refused, not sent', () => {
  for (const id of ['claude-opus-5', 'claude-haiku-4-5-20251001', '', undefined]) {
    assert.throws(() => R.directRequest('k', id, 's', messages), /unknown model/);
  }
});
