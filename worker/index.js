// Cloudflare Worker — proxies to NVIDIA Nemotron API
// Canonical AI proxy logic lives in api/shared.mjs
//
// Deploy:
//   cd worker && npx wrangler deploy
//   npx wrangler secret put NVIDIA_API_KEY
//
// Set VITE_API_URL on Vercel to the worker's URL

import { BASE_URL, DEFAULT_MODEL, buildRequestBody, extractResponseText, buildFallbackResponse } from '../api/shared.mjs';

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function respond(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: CORS });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (request.method !== 'POST') return respond({ error: 'POST only' }, 405);

    if (!env.NVIDIA_API_KEY) {
      return respond({ text: 'This service is not available right now.' });
    }

    try {
      const { messages, ...rest } = await request.json();
      if (!messages || !Array.isArray(messages)) {
        return respond({ error: 'messages array required' }, 400);
      }

      const body = buildRequestBody(messages, rest);
      const resp = await fetch(`${BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.NVIDIA_API_KEY}`,
        },
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        const txt = await resp.text();
        const lastMsg = messages[messages.length - 1]?.content || '';
        return respond({ text: buildFallbackResponse(lastMsg), error: txt });
      }

      const data = await resp.json();
      return respond({ text: extractResponseText(data), raw: data });
    } catch (err) {
      return respond({ text: 'Hmm, I had a hiccup. Try again? 🌵' });
    }
  },
};
