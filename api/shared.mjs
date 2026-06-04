export const BASE_URL = 'https://integrate.api.nvidia.com/v1';
export const DEFAULT_MODEL = 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning';

export function buildRequestBody(messages, overrides = {}) {
  return {
    model: overrides.model || DEFAULT_MODEL,
    messages,
    temperature: overrides.temperature ?? 0.6,
    top_p: overrides.top_p ?? 0.95,
    max_tokens: overrides.max_tokens ?? 65536,
    chat_template_kwargs: { enable_thinking: true },
    reasoning_budget: 16384,
    stream: false,
    ...(overrides.extra_body || {}),
  };
}

export function extractResponseText(json) {
  let out = '';
  if (json.choices && Array.isArray(json.choices)) {
    for (const c of json.choices) {
      if (c.message?.content) out += c.message.content;
      else if (c.message?.reasoning_content) out += c.message.reasoning_content;
      else if (c.delta?.content) out += c.delta.content;
    }
  } else if (typeof json.output === 'string') {
    out = json.output;
  } else {
    out = JSON.stringify(json);
  }
  return out || '...';
}

export function buildFallbackResponse(lastMsg = '') {
  const prompt = String(lastMsg).toLowerCase();
  if (prompt.includes('pack')) return 'Start with your passport, visa/entry permit paperwork, chargers, daily meds, and one carry-on set of essentials. Then add climate-safe clothes, toiletries, and one small comfort item so arrival day feels easier. 🌵';
  if (prompt.includes('visa') || prompt.includes('documents')) return 'Put passport validity, employment visa steps, attestation, and medical fitment at the top of the list. Keep scans of everything in one folder and check official UAE sources for the latest requirements. 📑';
  if (prompt.includes('week') || prompt.includes('arrival') || prompt.includes('day one')) return 'For week one, focus on SIM, transport, essentials for the apartment, and a simple grocery list. Don\'t try to finish everything on day one; settle in, then tackle the rest in order. 🛬';
  if (prompt.includes('housing')) return 'Prioritize commute, daylight, noise, and whether utilities are included before rent alone. If two places feel close, choose the one that makes daily life easier, not cheaper. 🏠';
  return 'I\'m here. Tell me what you\'re deciding, and I\'ll break it into the next concrete step. 🌵';
}
