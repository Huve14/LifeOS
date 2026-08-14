import { BASE_URL, DEFAULT_MODEL, buildRequestBody, extractResponseText, buildFallbackResponse } from './shared.mjs';

const API_KEY = process.env.NVIDIA_API_KEY;

function sendJson(res, code, obj) {
  const s = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(s),
    'Access-Control-Allow-Origin': '*',
  });
  res.end(s);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  if (!API_KEY) {
    return sendJson(res, 200, {
      text: 'This service is not available right now.',
    });
  }

  try {
    const { messages, ...rest } = req.body || {};
    if (!messages || !Array.isArray(messages)) {
      return sendJson(res, 400, { error: 'messages array required' });
    }

    const body = buildRequestBody(messages, rest);

    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(58000),
    });

    if (!response.ok) {
      const txt = await response.text();
      console.error(`NVIDIA API ${response.status}:`, txt);
      const lastMsg = messages[messages.length - 1]?.content || '';
      return sendJson(res, 200, { text: buildFallbackResponse(lastMsg) });
    }

    const json = await response.json();
    return sendJson(res, 200, { text: extractResponseText(json), raw: json });
  } catch (err) {
    console.error('proxy error:', err.message);
    const lastMsg = req.body?.messages?.[req.body.messages.length - 1]?.content || '';
    return sendJson(res, 200, { text: buildFallbackResponse(lastMsg) });
  }
}
