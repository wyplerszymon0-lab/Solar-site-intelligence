// Entry point for Cloud Run: wires the request handler to Claude on Vertex AI and
// to the Firestore daily counter. Configuration comes from environment variables.

import { createServer } from 'node:http';
import { AnthropicVertex } from '@anthropic-ai/vertex-sdk';
import { createHandler, IpLimiter, LIMITS, MemoryCounter } from './lib/app.js';
import { FirestoreCounter } from './lib/firestore-counter.js';

const env = process.env;
const port = Number(env.PORT || 8080);
const dailyLimit = Number(env.DAILY_LIMIT || 50);
const allowedOrigins = (env.ALLOWED_ORIGINS || 'https://wyplerszymon0-lab.github.io')
  .split(/[|,\s]+/).filter(Boolean); // '|' too: gcloud --set-env-vars splits on commas

// Credentials come from the Cloud Run service account (locally: gcloud ADC); no API key.
const vertex = new AnthropicVertex({
  projectId: env.GOOGLE_CLOUD_PROJECT || 'solar-site-intelligence',
  region: env.VERTEX_REGION || 'global',
});

const handler = createHandler({
  streamMessage: params => vertex.messages.stream(params),
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
  console.log(`solar-ai listening on ${port}; daily limit ${dailyLimit}; origins ${allowedOrigins.join(' ')}`);
});
