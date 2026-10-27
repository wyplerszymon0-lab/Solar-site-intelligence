import { test } from 'node:test';
import assert from 'node:assert/strict';
import Anthropic from '@anthropic-ai/sdk';
import { anthropicClientOptions, METADATA_IDENTITY_URL } from '../lib/anthropic-auth.js';

const FEDERATION = {
  ANTHROPIC_FEDERATION_RULE_ID: 'fdrl_test',
  ANTHROPIC_ORGANIZATION_ID: 'org-uuid',
  ANTHROPIC_SERVICE_ACCOUNT_ID: 'svac_test',
};

// Plays the GCP metadata server, the Anthropic token endpoint and the Messages API.
function fakeCloud() {
  const calls = [];
  let issued = 0;
  const fetchFn = async (url, init = {}) => {
    const headers = new Headers(init.headers);
    calls.push({ url: String(url), headers, body: init.body ? JSON.parse(init.body) : undefined });
    if (String(url) === METADATA_IDENTITY_URL) {
      assert.equal(headers.get('Metadata-Flavor'), 'Google');
      issued += 1;
      return new Response(`google.jwt.${issued}\n`);
    }
    if (String(url).endsWith('/v1/oauth/token')) {
      return Response.json({ access_token: 'sk-ant-oat-short-lived', token_type: 'Bearer', expires_in: 600 });
    }
    return Response.json({
      id: 'msg_1', type: 'message', role: 'assistant', model: 'm', content: [{ type: 'text', text: 'ok' }],
      stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 },
    });
  };
  return { calls, fetchFn };
}

test('an API key alone selects key mode', () => {
  const { mode, options } = anthropicClientOptions({ ANTHROPIC_API_KEY: 'sk-ant-api-x\n' });
  assert.equal(mode, 'key');
  assert.deepEqual(options, { apiKey: 'sk-ant-api-x' });
});

test('a key next to a federation rule is refused instead of silently winning', () => {
  assert.throws(() => anthropicClientOptions({ ...FEDERATION, ANTHROPIC_API_KEY: 'sk-ant-api-x' }), /not both/);
});

test('missing configuration fails at start-up, not on the first visitor', () => {
  assert.throws(() => anthropicClientOptions({}), /needs ANTHROPIC_FEDERATION_RULE_ID or ANTHROPIC_API_KEY/);
  assert.throws(() => anthropicClientOptions({ ANTHROPIC_FEDERATION_RULE_ID: 'fdrl_test' }), /ORGANIZATION_ID/);
});

test('federation exchanges the Google ID token and calls Claude with a bearer token, no key', async () => {
  const { calls, fetchFn } = fakeCloud();
  const { mode, options } = anthropicClientOptions(FEDERATION, fetchFn);
  assert.equal(mode, 'federation');
  const client = new Anthropic({ ...options, fetch: fetchFn, maxRetries: 0 });
  await client.messages.create({ model: 'm', max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] });

  const [metadata, exchange, message] = calls;
  assert.equal(metadata.url, METADATA_IDENTITY_URL);
  assert.equal(exchange.url, 'https://api.anthropic.com/v1/oauth/token');
  const { grant_type, ...exchanged } = exchange.body;
  assert.match(grant_type, /jwt-bearer/);
  assert.deepEqual(exchanged, {
    assertion: 'google.jwt.1', federation_rule_id: 'fdrl_test', organization_id: 'org-uuid', service_account_id: 'svac_test',
  });
  assert.equal(message.headers.get('authorization'), 'Bearer sk-ant-oat-short-lived');
  assert.equal(message.headers.get('x-api-key'), null);

  // The access token is cached: a second request does not exchange again.
  await client.messages.create({ model: 'm', max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] });
  assert.equal(calls.filter(c => c.url === METADATA_IDENTITY_URL).length, 1);
});

test('a metadata server error is reported, not sent as an empty assertion', async () => {
  const fetchFn = async () => new Response('nope', { status: 404 });
  const { options } = anthropicClientOptions(FEDERATION, fetchFn);
  await assert.rejects(options.credentials(), /metadata server returned 404/);
});
