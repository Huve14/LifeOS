// Cloudflare Worker — proxies to NVIDIA Nemotron API
// Free tier: no wall-clock timeout, only 30ms CPU (network wait is free)
// Deploy: https://dash.cloudflare.com → Workers & Pages → Create Worker
// Set env var NVIDIA_API_KEY in Cloudflare dashboard

const BASE_URL = 'https://integrate.api.nvidia.com/v1';
const MODEL = 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning';

export default {
  async fetch(request) {
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'POST only' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    const apiKey = request.headers.get('X-API-Key') || globalThis.NVIDIA_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ text: 'AI not configured — set NVIDIA_API_KEY on the Worker.' }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    try {
      const { messages, temperature, top_p, max_tokens } = await request.json();

      if (!messages || !Array.isArray(messages)) {
        return new Response(JSON.stringify({ error: 'messages required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

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
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        const txt = await resp.text();
        return new Response(JSON.stringify({ text: 'Hmm, I had a hiccup. Try again? 🌵', error: txt }), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }

      const json = await resp.json();
      let out = '';

      if (json.choices) {
        for (const c of json.choices) {
          if (c.message?.content) out += c.message.content;
          else if (c.message?.reasoning_content) out += c.message.reasoning_content;
        }
      }

      return new Response(JSON.stringify({ text: out || '...', raw: json }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    } catch (err) {
      return new Response(JSON.stringify({ text: 'Hmm, I had a hiccup. Try again? 🌵' }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
  },
};
