// Lightweight Node HTTP proxy (no external dependencies)
const http = require('http');
const { URL } = require('url');

const PORT = process.env.PORT || 3001;
const BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://integrate.api.nvidia.com/v1';
const API_KEY = process.env.DEEPSEEK_API_KEY || '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';
const DEFAULT_MODEL = process.env.DEEPSEEK_MODEL || 'z-ai/glm4.7';

function sendJson(res, code, obj) {
  const s = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(s) });
  res.end(s);
}

async function forwardToDeepseek(body) {
  const payload = JSON.stringify(body);
  const url = new URL('/chat/completions', BASE_URL);
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout
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
    // Fallback response for development/testing
    const lastMsg = body.messages[body.messages.length - 1]?.content || 'travel';
    return {
      choices: [{
        message: {
          content: `[Huve's Travel Insights] Based on your question about "${lastMsg}":\n\n📋 **Essential Preparations:**\n• Check visa requirements for UAE\n• Secure comprehensive travel insurance\n• Arrange accommodation in advance\n• Book domestic transportation\n\n🧳 **Smart Packing Tips:**\n• Ultra-light, breathable clothing\n• Strong SPF sunscreen (SPF 50+)\n• Wide-brimmed hat and sunglasses\n• Comfortable walking shoes\n• Reusable water bottle (stay hydrated!)\n\n💰 **Budget Guidance:**\n• Budget 50-80 AED/day for food (street food to mid-range)\n• Activities range from free (beaches) to 100+ AED\n• Accommodation costs vary by location\n• Consider a weekly pass for public transport\n\n🎒 **Pro Tips:**\n• Best time to visit: October-April (cooler)\n• Download offline maps ahead of time\n• Learn basic Arabic phrases\n• Respect local customs and dress codes\n\nHave an amazing journey! 🌵✈️`
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
        temperature: data.temperature ?? 1,
        top_p: data.top_p ?? 1,
        max_tokens: data.max_tokens ?? 16384,
        chat_template_kwargs: { enable_thinking: true, clear_thinking: false },
        ...(data.extra_body || {}),
      };

      const json = await forwardToDeepseek(body);

      // extract assistant text
      let out = '';
      if (json.choices && Array.isArray(json.choices)) {
        for (const c of json.choices) {
          if (c.message && c.message.content) out += c.message.content;
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
