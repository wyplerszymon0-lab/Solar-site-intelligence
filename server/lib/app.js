// Request handling for the AI report proxy, with every outside dependency injected
// (the model stream and the daily counter), so it is tested without network access.

export const MODEL = 'claude-haiku-5-5';
export const MAX_TOKENS = 4000;

export const LIMITS = {
  maxBodyBytes: 32_000,      // a report prompt is ~2 kB; follow-ups add a few more
  maxMessages: 11,           // the initial report plus five follow-up exchanges
  maxContentChars: 20_000,   // all messages together
  perIpPerDay: 10,
};

const SYSTEM_BASE =
  'You are a solar energy site assessment expert with geodetic expertise. ' +
  'Analyze photovoltaic installation sites and provide structured technical reports ' +
  'with specific numerical recommendations. Be precise, use measurements, and keep ' +
  'each section to 2–4 sentences.';

// The server owns the system prompt; clients only pick the language. Otherwise the
// public endpoint would be a free general-purpose chatbot.
export function systemPrompt(lang) {
  return lang === 'pl' ? SYSTEM_BASE + ' Respond in Polish.' : SYSTEM_BASE;
}

export class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Validate a parsed request body; returns { lang, messages } or throws RequestError(400). */
export function validateBody(body) {
  if (!body || typeof body !== 'object') throw new RequestError(400, 'body must be a JSON object');
  const lang = body.lang === 'pl' ? 'pl' : 'en';
  const { messages } = body;
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new RequestError(400, 'messages must be a non-empty array');
  }
  if (messages.length > LIMITS.maxMessages) {
    throw new RequestError(400, `at most ${LIMITS.maxMessages} messages`);
  }
  let chars = 0;
  messages.forEach((m, i) => {
    const expected = i % 2 === 0 ? 'user' : 'assistant';
    if (!m || m.role !== expected) throw new RequestError(400, `message ${i} must have role "${expected}"`);
    if (typeof m.content !== 'string' || !m.content.trim()) {
      throw new RequestError(400, `message ${i} must have non-empty text content`);
    }
    chars += m.content.length;
  });
  if (messages.length % 2 === 0) throw new RequestError(400, 'the last message must be from the user');
  if (chars > LIMITS.maxContentChars) throw new RequestError(400, `messages exceed ${LIMITS.maxContentChars} characters`);
  return { lang, messages: messages.map(m => ({ role: m.role, content: m.content })) };
}

/** Per-IP counts for the current UTC day, kept in memory (per instance, a soft limit). */
export class IpLimiter {
  constructor(limit, now = () => new Date()) {
    this.limit = limit;
    this.now = now;
    this.day = null;
    this.counts = new Map();
  }

  take(ip) {
    const day = utcDay(this.now());
    if (day !== this.day) {
      this.day = day;
      this.counts.clear();
    }
    const used = this.counts.get(ip) || 0;
    if (used >= this.limit) return false;
    this.counts.set(ip, used + 1);
    return true;
  }
}

/** In-memory daily counter with the same interface as the Firestore one (tests, local runs). */
export class MemoryCounter {
  constructor(limit, now = () => new Date()) {
    this.limit = limit;
    this.now = now;
    this.counts = new Map();
  }

  async take() {
    const day = utcDay(this.now());
    const used = this.counts.get(day) || 0;
    if (used >= this.limit) return { ok: false, remaining: 0 };
    this.counts.set(day, used + 1);
    return { ok: true, remaining: this.limit - used - 1 };
  }

  async remaining() {
    return Math.max(0, this.limit - (this.counts.get(utcDay(this.now())) || 0));
  }
}

export function utcDay(date) {
  return date.toISOString().slice(0, 10);
}

/** Client IP: Cloud Run puts the caller first in X-Forwarded-For. */
export function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.trim()) return fwd.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

export function corsHeaders(origin, allowedOrigins) {
  if (!origin || !allowedOrigins.includes(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '3600',
    Vary: 'Origin',
  };
}

async function readJson(req, maxBytes) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new RequestError(413, `request body over ${maxBytes} bytes`);
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new RequestError(400, 'body is not valid JSON');
  }
}

function sendJson(res, status, payload, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
  res.end(JSON.stringify(payload));
}

const errorBody = message => ({ type: 'error', error: { message } });

/**
 * Build the HTTP handler.
 * deps.streamMessage(params) -> async iterable of Messages API stream events, with .abort()
 * deps.dailyCounter -> { take(): {ok, remaining}, remaining(): number }
 */
export function createHandler({ streamMessage, dailyCounter, ipLimiter, allowedOrigins, log = console }) {
  return async function handler(req, res) {
    const cors = corsHeaders(req.headers.origin, allowedOrigins);
    const url = new URL(req.url, 'http://localhost');

    if (req.method === 'OPTIONS') {
      res.writeHead(204, cors);
      return res.end();
    }

    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/status')) {
      return sendJson(res, 200, { ok: true, model: MODEL, remainingToday: await dailyCounter.remaining() }, cors);
    }

    if (req.method !== 'POST' || url.pathname !== '/report') {
      return sendJson(res, 404, errorBody('not found'), cors);
    }

    // Browsers send Origin on cross-site requests; refuse other sites' pages outright.
    if (req.headers.origin && !cors['Access-Control-Allow-Origin']) {
      return sendJson(res, 403, errorBody('origin not allowed'));
    }

    let request;
    try {
      request = validateBody(await readJson(req, LIMITS.maxBodyBytes));
    } catch (err) {
      if (err instanceof RequestError) return sendJson(res, err.status, errorBody(err.message), cors);
      throw err;
    }

    if (!ipLimiter.take(clientIp(req))) {
      return sendJson(res, 429, errorBody(`limit of ${ipLimiter.limit} reports per day for one visitor reached`), cors);
    }
    const quota = await dailyCounter.take();
    if (!quota.ok) {
      return sendJson(res, 429, errorBody('the free demo has reached its daily limit; try tomorrow or use your own API key'), cors);
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'X-Remaining-Today': String(quota.remaining),
      ...cors,
    });

    const stream = streamMessage({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt(request.lang),
      messages: request.messages,
    });
    res.on('close', () => {
      if (!res.writableFinished) stream.abort?.();
    });

    try {
      for await (const event of stream) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    } catch (err) {
      if (!res.destroyed) {
        log.error?.(`model stream failed: ${err.message}`);
        res.write(`data: ${JSON.stringify(errorBody('the AI service failed; please try again'))}\n\n`);
      }
    }
    res.end();
  };
}
