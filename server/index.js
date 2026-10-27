// Entry point for Cloud Run: wires the request handler to Claude (Vertex AI or the
// Claude API) and to the Firestore daily counter. Configured by environment variables.

import { createServer } from 'node:http';
import Anthropic from '@anthropic-ai/sdk';
import { AnthropicVertex } from '@anthropic-ai/vertex-sdk';
import { anthropicClientOptions } from './lib/anthropic-auth.js';
import { createHandler, IpLimiter, LIMITS, MemoryCounter } from './lib/app.js';
import { FirestoreCounter } from './lib/firestore-counter.js';

const env = process.env;
const port = Number(env.PORT || 8080);
const dailyLimit = Number(env.DAILY_LIMIT || 50);
const allowedOrigins = (env.ALLOWED_ORIGINS || 'https://wyplerszymon0-lab.github.io')
  .split(/[|,\s]+/).filter(Boolean); // '|' too: gcloud --set-env-vars splits on commas

// AI_PROVIDER picks where Claude runs; both clients expose the same messages.stream().
//   vertex (default): Claude on Vertex AI, billed to the GCP project; credentials come
//                     from the Cloud Run service account (locally: gcloud ADC), no key.
//   anthropic:        the Claude API; on Cloud Run via workload identity federation (the
//                     service account's Google token, no stored key), locally with a key.
//                     See lib/anthropic-auth.js.
const provider = env.AI_PROVIDER || 'vertex';
let client;
let auth = 'service account';
if (provider === 'vertex') {
  client = new AnthropicVertex({
    projectId: env.GOOGLE_CLOUD_PROJECT || 'solar-site-intelligence',
    region: env.VERTEX_REGION || 'global',
  });
} else if (provider === 'anthropic') {
  const { mode, options } = anthropicClientOptions(env);
  auth = mode;
  client = new Anthropic(options);
} else {
  throw new Error(`unknown AI_PROVIDER "${provider}" (use vertex or anthropic)`);
}

const handler = createHandler({
  provider,
  streamMessage: params => client.messages.stream(params),
  dailyCounter: env.COUNTER === 'memory' ? new MemoryCounter(dailyLimit) : new FirestoreCounter(dailyLimit),
  ipLimiter: new IpLimiter(Number(env.PER_IP_PER_DAY || LIMITS.perIpPerDay)),
  allowedOrigins,
});

createServer((req, res) => {
  handler(req, res).catch(err => {
    console.error(err);
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ type: 'error', error: { message: 'internal error' } }));
  });
}).listen(port, () => {
  console.log(`solar-ai listening on ${port}; provider ${provider} (${auth}); daily limit ${dailyLimit}; origins ${allowedOrigins.join(' ')}`);
});
