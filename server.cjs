// Lightweight Node HTTP proxy (no external dependencies)
const http = require('http');
const { URL } = require('url');

const PORT = process.env.PORT || 3001;
const BASE_URL = (process.env.DEEPSEEK_BASE_URL || 'https://integrate.api.nvidia.com/v1').replace(/\/?$/, '/');
const API_KEY = process.env.DEEPSEEK_API_KEY || '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';
const DEFAULT_MODEL = process.env.DEEPSEEK_MODEL || 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning';

function sendJson(res, code, obj) {
  const s = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(s) });
  res.end(s);
}

function buildFallbackResponse(lastMsg = '') {
  const prompt = String(lastMsg).toLowerCase();

  if (prompt.includes('pack')) {
    return 'Start with your passport, visa/entry permit paperwork, chargers, daily meds, and one carry-on set of essentials. Then add climate-safe clothes, toiletries, and one small comfort item so arrival day feels easier. 🌵';
  }

  if (prompt.includes('visa') || prompt.includes('documents')) {
    return 'Put passport validity, employment visa steps, attestation, and medical fitment at the top of the list. Keep scans of everything in one folder and check official UAE sources for the latest requirements. 📑';
  }

  if (prompt.includes('week') || prompt.includes('arrival') || prompt.includes('day one')) {
    return 'For week one, focus on SIM, transport, essentials for the apartment, and a simple grocery list. Don\'t try to finish everything on day one; settle in, then tackle the rest in order. 🛬';
  }

  if (prompt.includes('housing')) {
    return 'Prioritize commute, daylight, noise, and whether utilities are included before rent alone. If two places feel close, choose the one that makes daily life easier, not just cheaper. 🏠';
  }

  return 'I\'m here. Tell me what you\'re deciding, and I\'ll break it into the next concrete step. 🌵';
}

async function forwardToDeepseek(body) {
  const payload = JSON.stringify(body);
  const url = new URL('chat/completions', BASE_URL);
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000); // 120s timeout (reasoning model)
    const r = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
      body: payload,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!r.ok) {
      const txt = await r.text();
      console.error(`Deepseek HTTP ${r.status}:`, txt);
      throw new Error(`Deepseek error ${r.status}: ${txt}`);
    }
    return r.json();
  } catch (e) {
    console.error('Deepseek API unavailable, using fallback:', e.message);
    const lastMsg = body.messages[body.messages.length - 1]?.content || 'travel';
    return {
      choices: [{
        message: {
          content: buildFallbackResponse(lastMsg)
        }
      }]
    };
  }
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'POST' && req.url === '/api/deepseek') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const raw = Buffer.concat(chunks).toString();
      const data = raw ? JSON.parse(raw) : {};
      const { messages } = data;
      if (!messages || !Array.isArray(messages)) return sendJson(res, 400, { error: 'messages array required' });

      const body = {
        model: data.model || DEFAULT_MODEL,
        messages: data.messages,
        temperature: data.temperature ?? 0.6,
        top_p: data.top_p ?? 0.95,
        max_tokens: data.max_tokens ?? 65536,
        chat_template_kwargs: { enable_thinking: true },
        reasoning_budget: 16384,
        stream: false,
        ...(data.extra_body || {}),
      };

      const json = await forwardToDeepseek(body);

      // extract assistant text
      let out = '';
      if (json.choices && Array.isArray(json.choices)) {
        for (const c of json.choices) {
          if (c.message && c.message.content) out += c.message.content;
          else if (c.message && c.message.reasoning_content) out += c.message.reasoning_content;
          else if (c.delta && c.delta.content) out += c.delta.content;
        }
      } else if (typeof json.output === 'string') out = json.output;
      else out = JSON.stringify(json);

      return sendJson(res, 200, { text: out, raw: json });
    }

    // unknown
    sendJson(res, 404, { error: 'not found' });
  } catch (err) {
    console.error('proxy error', err);
    sendJson(res, 500, { error: String(err) });
  }
});

server.listen(PORT, () => console.log(`Deepseek proxy listening on http://localhost:${PORT}`));
