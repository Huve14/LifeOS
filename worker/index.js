// Cloudflare Worker — proxies to NVIDIA Nemotron API
// Free tier: no wall-clock timeout, network I/O is free
//
// Deploy:
//   cd worker && npx wrangler deploy
//   npx wrangler secret put NVIDIA_API_KEY
//
// Set VITE_API_URL on Vercel to the worker's URL

const BASE_URL = 'https://integrate.api.nvidia.com/v1';
const MODEL = 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning';

export default {
  async fetch(request, env) {
    const headers = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers });
    }

    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'POST only' }), {
        status: 405,
        headers,
      });
    }

    if (!env.NVIDIA_API_KEY) {
      return new Response(
        JSON.stringify({ text: 'AI not configured — set NVIDIA_API_KEY via wrangler secret.' }),
        { headers },
      );
    }

    try {
      const { messages, temperature, top_p, max_tokens } = await request.json();

      const body = {
        model: MODEL,
        messages,
        temperature: temperature ?? 0.6,
        top_p: top_p ?? 0.95,
        max_tokens: max_tokens ?? 65536,
        chat_template_kwargs: { enable_thinking: true },
        reasoning_budget: 16384,
        stream: false,
      };

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
        return new Response(
          JSON.stringify({ text: 'Hmm, I had a hiccup. Try again? 🌵', error: txt }),
          { headers },
        );
      }

      const json = await resp.json();
      let out = '';
      for (const c of json.choices || []) {
        if (c.message?.content) out += c.message.content;
        else if (c.message?.reasoning_content) out += c.message.reasoning_content;
      }

      return new Response(JSON.stringify({ text: out || '...', raw: json }), { headers });
    } catch (err) {
      return new Response(
        JSON.stringify({ text: 'Hmm, I had a hiccup. Try again? 🌵' }),
        { headers },
      );
    }
  },
};
