const BASE_URL = 'https://integrate.api.nvidia.com/v1/';
const API_KEY = process.env.DEEPSEEK_API_KEY;
const DEFAULT_MODEL = process.env.DEEPSEEK_MODEL || 'mistralai/mistral-nemotron';

function sendJson(res, code, obj) {
  const s = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(s),
    'Access-Control-Allow-Origin': '*',
  });
  res.end(s);
}

function buildFallbackResponse(lastMsg = '') {
  const prompt = String(lastMsg).toLowerCase();
  if (prompt.includes('pack')) return 'Start with your passport, visa/entry permit paperwork, chargers, daily meds, and one carry-on set of essentials. Then add climate-safe clothes, toiletries, and one small comfort item so arrival day feels easier. 🌵';
  if (prompt.includes('visa') || prompt.includes('documents')) return 'Put passport validity, employment visa steps, attestation, and medical fitment at the top of the list. Keep scans of everything in one folder and check official UAE sources for the latest requirements. 📑';
  if (prompt.includes('week') || prompt.includes('arrival') || prompt.includes('day one')) return 'For week one, focus on SIM, transport, essentials for the apartment, and a simple grocery list. Don\'t try to finish everything on day one; settle in, then tackle the rest in order. 🛬';
  if (prompt.includes('housing')) return 'Prioritize commute, daylight, noise, and whether utilities are included before rent alone. If two places feel close, choose the one that makes daily life easier, not just cheaper. 🏠';
  return 'I\'m here. Tell me what you\'re deciding, and I\'ll break it into the next concrete step. 🌵';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  if (!API_KEY) {
    return sendJson(res, 200, {
      text: 'AI is not configured yet. Set the DEEPSEEK_API_KEY environment variable.',
    });
  }

  try {
    const { messages, temperature, top_p, max_tokens } = req.body || {};
    if (!messages || !Array.isArray(messages)) {
      return sendJson(res, 400, { error: 'messages array required' });
    }

    const body = {
      model: DEFAULT_MODEL,
      messages,
      temperature: temperature ?? 0.6,
      top_p: top_p ?? 0.95,
      max_tokens: max_tokens ?? 4096,
    };

    const response = await fetch(BASE_URL + 'chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8500),
    });

    if (!response.ok) {
      const txt = await response.text();
      console.error(`NVIDIA API ${response.status}:`, txt);
      const lastMsg = messages[messages.length - 1]?.content || '';
      return sendJson(res, 200, { text: buildFallbackResponse(lastMsg) });
    }

    const json = await response.json();
    let out = '';
    if (json.choices) {
      for (const c of json.choices) {
        if (c.message && c.message.content) out += c.message.content;
        else if (c.message && c.message.reasoning_content) out += c.message.reasoning_content;
        else if (c.delta && c.delta.content) out += c.delta.content;
      }
    }
    if (!out && json.choices?.[0]?.message?.reasoning_content) {
      out = json.choices[0].message.reasoning_content;
    }

    return sendJson(res, 200, { text: out || '...', raw: json });
  } catch (err) {
    console.error('proxy error:', err.message);
    const lastMsg = req.body?.messages?.[req.body.messages.length - 1]?.content || '';
    return sendJson(res, 200, { text: buildFallbackResponse(lastMsg) });
  }
}
