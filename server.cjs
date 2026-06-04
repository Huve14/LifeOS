// Lightweight Node HTTP proxy (no external dependencies)
// Canonical AI proxy logic lives in api/shared.mjs — this file is for local dev only
const http = require('http');
const { URL } = require('url');

const PORT = process.env.PORT || 3001;
const BASE_URL = (process.env.DEEPSEEK_BASE_URL || 'https://integrate.api.nvidia.com/v1').replace(/\/?$/, '/');
const API_KEY = process.env.NVIDIA_API_KEY || process.env.DEEPSEEK_API_KEY;
const DEFAULT_MODEL = process.env.NVIDIA_MODEL || process.env.DEEPSEEK_MODEL || 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning';

function sendJson(res, code, obj) {
  const s = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(s) });
  res.end(s);
}

// Lazy-load shared utilities (ESM → CJS bridge)
let _shared = null;
async function shared() {
  if (!_shared) _shared = await import('./api/shared.mjs');
  return _shared;
}

async function forwardToDeepseek(body) {
  const payload = JSON.stringify(body);
  const url = new URL('chat/completions', BASE_URL);
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);
    const r = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
      body: payload,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!r.ok) {
      const txt = await r.text();
      console.error(`NVIDIA API ${r.status}:`, txt);
      throw new Error(`NVIDIA API error ${r.status}: ${txt}`);
    }
    return r.json();
  } catch (e) {
    console.error('NVIDIA API unavailable, using fallback:', e.message);
    const s = await shared();
    const lastMsg = body.messages[body.messages.length - 1]?.content || 'travel';
    return {
      choices: [{
        message: { content: s.buildFallbackResponse(lastMsg) }
      }]
    };
  }
}

// In-memory rate limiter (simple token bucket)
const rateLimit = (() => {
  const maxTokens = 20;        // max requests
  const refillRate = 1000 * 60; // refill interval (1 min)
  const clients = new Map();
  return (ip) => {
    const now = Date.now();
    let entry = clients.get(ip);
    if (!entry || now - entry.resetAt > refillRate) {
      entry = { tokens: maxTokens, resetAt: now + refillRate };
      clients.set(ip, entry);
    }
    if (entry.tokens <= 0) return false;
    entry.tokens--;
    return true;
  };
})();

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'POST' && req.url === '/api/deepseek') {
      const ip = req.socket.remoteAddress || 'unknown';
      if (!rateLimit(ip)) {
        return sendJson(res, 429, { error: 'Too many requests. Please wait before sending another message.' });
      }

      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const raw = Buffer.concat(chunks).toString();
      const data = raw ? JSON.parse(raw) : {};
      const { messages } = data;
      if (!messages || !Array.isArray(messages)) return sendJson(res, 400, { error: 'messages array required' });

      const s = await shared();
      const body = {
        ...s.buildRequestBody(messages, data),
        model: data.model || DEFAULT_MODEL,
      };

      const json = await forwardToDeepseek(body);
      const text = s.extractResponseText(json);

      return sendJson(res, 200, { text, raw: json });
    }

    sendJson(res, 404, { error: 'not found' });
  } catch (err) {
    console.error('proxy error', err);
    sendJson(res, 500, { error: String(err) });
  }
});

server.listen(PORT, () => console.log(`Deepseek proxy listening on http://localhost:${PORT}`));
