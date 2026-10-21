import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import {
  createHandler, IpLimiter, LIMITS, MemoryCounter, MODEL, systemPrompt, validateBody,
} from '../lib/app.js';

const ORIGIN = 'https://wyplerszymon0-lab.github.io';
const user = content => ({ role: 'user', content });
const assistant = content => ({ role: 'assistant', content });

// A fake model stream yielding the same event shapes as the Messages API.
function fakeStream(text, calls) {
  return params => {
    calls?.push(params);
    const events = [
      { type: 'message_start', message: { id: 'msg_1' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' } },
      { type: 'message_stop' },
    ];
    return { async *[Symbol.asyncIterator]() { yield* events; }, abort() {} };
  };
}

async function withServer(deps, fn) {
  const handler = createHandler({
    dailyCounter: new MemoryCounter(50),
    ipLimiter: new IpLimiter(10),
    allowedOrigins: [ORIGIN],
    log: { error() {} },
    ...deps,
  });
  const server = createServer((req, res) => handler(req, res));
  await new Promise(r => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(base);
  } finally {
    server.close();
  }
}

const post = (base, body, headers = {}) => fetch(`${base}/report`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: ORIGIN, ...headers },
  body: typeof body === 'string' ? body : JSON.stringify(body),
});

test('validateBody accepts a report and follow-ups, keeping only role and content', () => {
  const ok = validateBody({ lang: 'pl', messages: [user('a'), { ...assistant('b'), extra: 1 }, user('c')] });
  assert.equal(ok.lang, 'pl');
  assert.deepEqual(ok.messages, [user('a'), assistant('b'), user('c')]);
  assert.equal(validateBody({ lang: 'xx', messages: [user('a')] }).lang, 'en');
});

test('validateBody rejects malformed or oversized conversations', () => {
  const bad = [
    null,
    { messages: [] },
    { messages: [assistant('a')] },
    { messages: [user('a'), assistant('b')] },  // must end with the user
    { messages: [user('a'), user('b')] },
    { messages: [user('   ')] },
    { messages: [{ role: 'user', content: [{ type: 'text', text: 'x' }] }] },
    { messages: Array.from({ length: LIMITS.maxMessages + 2 }, (_, i) => (i % 2 ? assistant('b') : user('a'))) },
    { messages: [user('x'.repeat(LIMITS.maxContentChars + 1))] },
  ];
  for (const body of bad) assert.throws(() => validateBody(body), { status: 400 }, JSON.stringify(body)?.slice(0, 80));
});

test('the server sets the system prompt; clients only choose the language', () => {
  assert.match(systemPrompt('en'), /solar energy site assessment expert/);
  assert.doesNotMatch(systemPrompt('en'), /Polish/);
  assert.match(systemPrompt('pl'), /Respond in Polish\.$/);
});

test('IpLimiter allows N per visitor per UTC day and resets the next day', () => {
  let now = new Date('2026-10-15T10:00:00Z');
  const limiter = new IpLimiter(2, () => now);
  assert.deepEqual([limiter.take('a'), limiter.take('a'), limiter.take('a'), limiter.take('b')], [true, true, false, true]);
  now = new Date('2026-10-16T00:00:01Z');
  assert.equal(limiter.take('a'), true);
});

test('MemoryCounter enforces the daily cap and reports what is left', async () => {
  const counter = new MemoryCounter(2, () => new Date('2026-10-15T10:00:00Z'));
  assert.deepEqual(await counter.take(), { ok: true, remaining: 1 });
  assert.deepEqual(await counter.take(), { ok: true, remaining: 0 });
  assert.deepEqual(await counter.take(), { ok: false, remaining: 0 });
  assert.equal(await counter.remaining(), 0);
});

test('POST /report streams the model events as SSE with fixed model and server prompt', async () => {
  const calls = [];
  await withServer({ streamMessage: fakeStream('Hello', calls) }, async base => {
    const res = await post(base, { lang: 'pl', messages: [user('Analyze this site')] });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'text/event-stream');
    assert.equal(res.headers.get('access-control-allow-origin'), ORIGIN);
    assert.equal(res.headers.get('x-remaining-today'), '49');
    const events = (await res.text()).trim().split('\n\n').map(l => JSON.parse(l.replace(/^data: /, '')));
    assert.deepEqual(events.map(e => e.type), ['message_start', 'content_block_delta', 'message_delta', 'message_stop']);
    assert.equal(events[1].delta.text, 'Hello');
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, MODEL);
  assert.equal(calls[0].system, systemPrompt('pl'));
  assert.deepEqual(calls[0].messages, [user('Analyze this site')]);
});

test('daily cap, per-visitor cap, foreign origins and bad bodies are refused before the model is called', async () => {
  const calls = [];
  await withServer(
    { streamMessage: fakeStream('x', calls), dailyCounter: new MemoryCounter(1), ipLimiter: new IpLimiter(5) },
    async base => {
      const body = { messages: [user('a')] };
      assert.equal((await post(base, body)).status, 200);
      const capped = await post(base, body);
      assert.equal(capped.status, 429);
      assert.match((await capped.json()).error.message, /daily limit/);
      assert.equal((await post(base, body, { Origin: 'https://evil.example' })).status, 403);
      assert.equal((await post(base, '{not json')).status, 400);
      assert.equal((await post(base, 'x'.repeat(LIMITS.maxBodyBytes + 1))).status, 413);
    },
  );
  assert.equal(calls.length, 1);

  await withServer({ streamMessage: fakeStream('x', calls), ipLimiter: new IpLimiter(1) }, async base => {
    const body = { messages: [user('a')] };
    await (await post(base, body, { 'X-Forwarded-For': '1.2.3.4' })).text();
    assert.equal((await post(base, body, { 'X-Forwarded-For': '1.2.3.4, 10.0.0.1' })).status, 429);
    assert.equal((await post(base, body, { 'X-Forwarded-For': '5.6.7.8' })).status, 200);
  });
});

test('a failing model stream ends with an error event, not a hung connection', async () => {
  const failing = () => ({
    async *[Symbol.asyncIterator]() {
      yield { type: 'message_start', message: {} };
      throw new Error('quota exceeded');
    },
    abort() {},
  });
  await withServer({ streamMessage: failing }, async base => {
    const text = await (await post(base, { messages: [user('a')] })).text();
    const last = JSON.parse(text.trim().split('\n\n').pop().replace(/^data: /, ''));
    assert.equal(last.type, 'error');
    assert.match(last.error.message, /AI service failed/);
  });
});

test('GET /status reports the model and the reports left today; OPTIONS answers CORS preflight', async () => {
  await withServer({ streamMessage: fakeStream('x') }, async base => {
    const status = await (await fetch(`${base}/status`)).json();
    assert.deepEqual(status, { ok: true, model: MODEL, provider: 'vertex', remainingToday: 50 });
    const pre = await fetch(`${base}/report`, { method: 'OPTIONS', headers: { Origin: ORIGIN } });
    assert.equal(pre.status, 204);
    assert.match(pre.headers.get('access-control-allow-methods'), /POST/);
    const other = await fetch(`${base}/report`, { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } });
    assert.equal(other.headers.get('access-control-allow-origin'), null);
  });
});
