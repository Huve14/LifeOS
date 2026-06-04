// data.jsx — Demo data and AI helper for Suveda

// Move target: Abu Dhabi - Al Khalifa City. Default = ~90 days from "today".
const DEFAULT_MOVE_DATE = (() => {
  const d = new Date();
  d.setDate(d.getDate() + 92);
  return d.toISOString().slice(0, 10);
})();

// Demo content tuned to the move (UAE-specific docs, kitchen for studio, etc.)
const MONTHLY_BUDGET = [
  { id: 'rent',     label: 'Rent',        emoji: '🏠', planned: 4200, spent: 0, fixed: true },
  { id: 'utilities', label: 'Utilities + Internet', emoji: '⚡', planned: 500, spent: 0, fixed: true },
  { id: 'groceries', label: 'Food & Groceries',    emoji: '🍽️', planned: 1200, spent: 0, fixed: false },
  { id: 'transport', label: 'Transport',   emoji: '🚗', planned: 400, spent: 0, fixed: false },
  { id: 'insurance', label: 'Health Insurance',    emoji: '🏥', planned: 300, spent: 0, fixed: true },
  { id: 'fun',       label: 'Life & Fun',  emoji: '🎮', planned: 700, spent: 0, fixed: false },
  { id: 'savings',   label: 'Savings',     emoji: '💰', planned: 1500, spent: 0, fixed: false },
];

const SEED = {
  packing: {
    rooms: [
      { id: 'bedroom', label: 'Bedroom', emoji: '🛏️',
        items: [
          { id: 'b1', name: 'Winter clothes (donate?)', status: 'pending' },
          { id: 'b2', name: 'Summer wardrobe', status: 'pending' },
          { id: 'b3', name: 'Bedding & duvet', status: 'pending' },
          { id: 'b4', name: 'Modest / abaya layers', status: 'pending' },
          { id: 'b5', name: 'Jewelry box', status: 'pending' },
          { id: 'b6', name: 'Suitcases (2 large + carry-on)', status: 'pending' },
        ] },
      { id: 'kitchen', label: 'Kitchen', emoji: '🍳',
        items: [
          { id: 'k1', name: 'Spice tin (ammachi\'s)', status: 'pending' },
          { id: 'k2', name: 'Pressure cooker', status: 'pending' },
          { id: 'k3', name: 'Tea kettle', status: 'pending' },
          { id: 'k4', name: 'Knife set', status: 'pending' },
        ] },
      { id: 'bathroom', label: 'Bathroom', emoji: '🧴',
        items: [
          { id: 'ba1', name: 'Skincare stash', status: 'pending' },
          { id: 'ba2', name: 'Hair products (3-mo supply)', status: 'pending' },
          { id: 'ba3', name: 'Travel toiletries', status: 'pending' },
        ] },
      { id: 'living', label: 'Living', emoji: '🛋️',
        items: [
          { id: 'l1', name: 'Photo frames', status: 'pending' },
          { id: 'l2', name: 'Books (favorites only)', status: 'pending' },
          { id: 'l3', name: 'Plants (rehome 🌿)', status: 'pending' },
        ] },
      { id: 'office', label: 'Office', emoji: '💻',
        items: [
          { id: 'o1', name: 'Laptop + charger', status: 'pending' },
          { id: 'o2', name: 'Travel adapter (UAE Type G)', status: 'pending' },
          { id: 'o3', name: 'Notebooks', status: 'pending' },
          { id: 'o4', name: 'Hard drive backups', status: 'pending' },
        ] },
      { id: 'docs', label: 'Documents', emoji: '📁',
        items: [
          { id: 'd1', name: 'Document folder (passport, etc.)', status: 'pending' },
          { id: 'd2', name: 'Contracts copy', status: 'pending' },
        ] },
    ],
  },
  documents: [
    { id: 'passport', name: 'Passport (6+ months valid)', status: 'pending', emoji: '📕', note: 'Check expiry — must be valid through Aug 2027' },
    { id: 'evisa',    name: 'UAE Employment Visa', status: 'pending', emoji: '🛂', note: 'Sponsor will initiate — track entry permit' },
    { id: 'eid',      name: 'Emirates ID prep docs', status: 'pending', emoji: '🪪', note: 'Photo + biometrics on arrival' },
    { id: 'medical',  name: 'Medical fitness test', status: 'pending', emoji: '🩺', note: 'Within 30 days of arrival' },
    { id: 'attest',   name: 'Degree attestation', status: 'pending', emoji: '🎓', note: 'MEA → UAE Embassy' },
    { id: 'marriage', name: 'Marriage cert (attested)', status: 'pending', emoji: '💍', note: 'If sponsoring family later' },
    { id: 'license',  name: 'Driver\'s license docs', status: 'pending', emoji: '🚗', note: 'For UAE conversion' },
    { id: 'health',   name: 'International health insurance', status: 'pending', emoji: '🏥', note: '90-day bridge cover' },
    { id: 'pet',      name: 'Pet import paperwork', status: 'pending', emoji: '🐾', note: 'Skip if no pet' },
  ],
  tasks: [
    { id: 't1', when: '90+ days', text: 'Sign offer letter & accept', status: 'pending' },
    { id: 't2', when: '90+ days', text: 'Apply for entry permit', status: 'pending' },
    { id: 't3', when: '60 days',  text: 'Notify landlord (2-mo notice)', status: 'pending' },
    { id: 't4', when: '60 days',  text: 'Get degree attested', status: 'pending' },
    { id: 't5', when: '60 days',  text: 'Open international bank account', status: 'pending' },
    { id: 't6', when: '30 days',  text: 'Book one-way flight ✈️', status: 'pending' },
    { id: 't7', when: '30 days',  text: 'Arrange shipping for boxes', status: 'pending' },
    { id: 't8', when: '30 days',  text: 'Cancel utilities + subscriptions', status: 'pending' },
    { id: 't9', when: '14 days',  text: 'Goodbye dinner with family', status: 'pending' },
    { id: 't10', when: '14 days', text: 'Forward mail / update address', status: 'pending' },
    { id: 't11', when: '7 days',  text: 'Pack carry-on essentials', status: 'pending' },
    { id: 't12', when: '7 days',  text: 'Confirm temporary housing', status: 'pending' },
    { id: 't13', when: 'Move day', text: 'Final apartment walkthrough', status: 'pending' },
    { id: 't14', when: 'Move day', text: 'Catch flight to AUH 🛬', status: 'pending' },
    { id: 't15', when: 'After',   text: 'Apply for Emirates ID', status: 'pending' },
    { id: 't16', when: 'After',   text: 'Open ADCB / Emirates NBD account', status: 'pending' },
    { id: 't17', when: 'After',   text: 'Get Etisalat / du SIM', status: 'pending' },
  ],
  budget: {
    currency: 'AED',
    fxToUSD: 0.272,
    monthlyIncome: 8800,
    monthly: [...MONTHLY_BUDGET.map(c => ({...c}))],
    total: 32000,
    categories: [
      { id: 'flights',  label: 'Flights',         emoji: '✈️', planned: 4500,  spent: 0 },
      { id: 'shipping', label: 'Shipping & boxes', emoji: '📦', planned: 3500,  spent: 0 },
      { id: 'visa',     label: 'Visa & docs',      emoji: '📑', planned: 2200,  spent: 0 },
      { id: 'deposit',  label: 'Housing deposit',  emoji: '🏠', planned: 12000, spent: 0 },
      { id: 'furniture', label: 'Furniture & home', emoji: '🛋️', planned: 6000, spent: 0 },
      { id: 'buffer',   label: 'First-month buffer', emoji: '🌙', planned: 3800, spent: 0 },
    ],
  },
  shopping: [
    { id: 's1', name: 'UAE plug adapters (Type G)', cat: 'Tech', status: 'toBuy', price: 60 },
    { id: 's2', name: 'Light linen abayas', cat: 'Clothing', status: 'toBuy', price: 480 },
    { id: 's3', name: 'Sunscreen SPF 50 (large)', cat: 'Apartment', status: 'toBuy', price: 90 },
    { id: 's4', name: 'eSIM for first week', cat: 'Tech', status: 'toBuy', price: 110 },
    { id: 's5', name: 'Bedding set (queen)', cat: 'Apartment', status: 'missing' },
    { id: 's6', name: 'Steam iron + board', cat: 'Apartment', status: 'missing' },
    { id: 's7', name: 'Reusable water bottle', cat: 'Apartment', status: 'toBuy', price: 75 },
  ],
  housing: [
    { id: 'h1', name: 'Studio · Al Khalifa City A', rent: 4200,
      pros: ['Walking distance to mosque', 'Quiet street', 'New build'],
      cons: ['No balcony', 'Far from metro'],
      status: 'shortlisted', area: 'Al Khalifa City A', size: '52 sqm',
    },
    { id: 'h2', name: '1BR · Khalifa Park side', rent: 5800,
      pros: ['Big balcony', 'Pool + gym', 'Closer to airport'],
      cons: ['Above budget', 'Noisier'],
      status: 'viewing', area: 'Khalifa City', size: '78 sqm',
    },
    { id: 'h3', name: 'Studio · Mohammed Bin Zayed', rent: 3600,
      pros: ['Cheapest', 'Family compound'],
      cons: ['Far from work', 'Older building'],
      status: 'considering', area: 'MBZ City', size: '46 sqm',
    },
  ],
  memories: {
    lastTimes: [
      { id: 'lt1', text: 'Chai at the corner shop', done: false },
      { id: 'lt2', text: 'Visit ammachi one last time', done: false },
      { id: 'lt3', text: 'Sunset at your favourite spot', done: false },
      { id: 'lt4', text: 'Walk through the neighbourhood park', done: false },
      { id: 'lt5', text: 'That one biryani place', done: false },
    ],
    goodbyes: [
      { id: 'gb1', name: 'Ammachi', note: 'Grandmother — take her photo', done: false },
      { id: 'gb2', name: 'Parents', note: 'Help them set up video calls', done: false },
      { id: 'gb3', name: 'Siblings', note: 'Promise weekly catch-ups', done: false },
      { id: 'gb4', name: 'Close friends', note: 'Goodbye dinner (t9)', done: false },
    ],
  },
  habits: [
    { id: 'h1', name: 'Drink 8 glasses of water', emoji: '💧', streak: 0, lastDone: '' },
    { id: 'h2', name: '10 min walk or stretch', emoji: '🚶', streak: 0, lastDone: '' },
    { id: 'h3', name: 'Read for 15 min', emoji: '📖', streak: 0, lastDone: '' },
    { id: 'h4', name: 'Practice Arabic (Duolingo)', emoji: '🇦🇪', streak: 0, lastDone: '' },
    { id: 'h5', name: 'Journal 5 min', emoji: '✍️', streak: 0, lastDone: '' },
  ],
  journal: [],
  contacts: [
    { id: 'c1', name: 'SABIS HR', role: 'Sponsor / Visa', phone: '', email: '', note: 'They initiate the entry permit' },
    { id: 'c2', name: 'Current landlord', role: 'Housing notice', phone: '', email: '', note: '2-month notice required (t3)' },
    { id: 'c3', name: 'Friend in AUH', role: 'On-ground support', phone: '', email: '', note: 'Can help with apartment viewing' },
  ],
  whyNote: `My gorgeous baby Suveda, I have written this for you to use as a fallback and guide to help you in and around so that you know I am always with you whether far or near, that I am close to your heart and soul forever and always 🌍`,
  whyNote2: `I'm doing this to make sure you still feel loved and appreciated, always seen and always heard, wherever life takes us just know I'll always be right there to help you through it... I love you my baby.`,
  first48: {
    simCard: { provider: 'Etisalat / du', where: 'Airport or Al Wahda Mall', note: 'Tourist eSIM works day 1' },
    groceries: { store: 'Lulu Hypermarket', location: 'Al Khalifa City', tip: 'Walkable from most studios' },
    mosque: { name: 'Sheikh Khalifa Mosque', location: 'Al Khalifa City', note: 'Walking distance from the studio' },
    firstMeal: { place: 'Al Fanar Restaurant', location: 'Al Raha Mall', dish: 'Machboos — traditional Emirati' },
    transport: { app: 'Careem', note: 'Works like Uber, also delivers food' },
  },
};

function applyProgress(seed, level) {
  // level: 'empty' | 'half' | 'almost'
  const ratio = { empty: 0, half: 0.5, almost: 0.85 }[level] ?? 0;
  const data = JSON.parse(JSON.stringify(seed));

  // packing
  data.packing.rooms.forEach(room => {
    room.items.forEach((item, i) => {
      if (Math.random() < ratio) {
        item.status = ['packed', 'packed', 'toBuy', 'missing'][i % 4];
      }
    });
  });

  // documents
  data.documents.forEach((d, i) => {
    if (Math.random() < ratio) d.status = 'done';
  });

  // tasks — earlier ones more likely done
  data.tasks.forEach((t, i) => {
    const order = i / data.tasks.length; // 0..1
    if (Math.random() < ratio * (1 - order * 0.3)) t.status = 'done';
  });

  // budget — spend roughly proportional
  if (data.budget.monthly) {
    data.budget.monthly.forEach(c => {
      c.spent = Math.round(c.planned * ratio * (0.5 + Math.random() * 0.8));
      if (c.spent > c.planned) c.spent = c.planned;
    });
  }
  data.budget.categories.forEach(c => {
    c.spent = Math.round(c.planned * ratio * (0.7 + Math.random() * 0.6));
    if (c.spent > c.planned) c.spent = c.planned;
  });

  // shopping
  data.shopping.forEach(s => {
    if (Math.random() < ratio) s.status = 'packed';
  });

  // memories
  if (data.memories) {
    data.memories.lastTimes.forEach(m => { if (Math.random() < ratio * 0.3) m.done = true; });
    data.memories.goodbyes.forEach(g => { if (Math.random() < ratio * 0.3) g.done = true; });
  }

  return data;
}

// AI helper — calls the Huve AI proxy (Cloudflare Worker → NVIDIA API)
async function askHuve(prompt, context = '') {
  const sys = `You are Huve, a warm, playful, slightly adventurous AI helper inside Suveda's "moving abroad" app. Suveda is moving from her home country to Al Khalifa City, Abu Dhabi, UAE. Be brief (2-4 sentences max), friendly, practical, and encouraging. Use the occasional emoji. Never give legal/medical advice — suggest official sources (e.g. ICP, GDRFA, MoHRE) when relevant. Speak like a thoughtful friend, not a chatbot.`;
  const user = context ? `Context: ${context}\n\nQuestion: ${prompt}` : prompt;

  // If a local proxy is available, call it; otherwise fall back.
  const apiUrl = (window.__suvedaApiUrl || '/api/huve').trim();
  try {
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [ { role: 'user', content: `${sys}\n\n${user}` } ],
        temperature: 0.6,
        top_p: 0.95,
        max_tokens: 2048,
      }),
    });

    if (res.ok) {
      const j = await res.json();
      return j.text || (j.raw ? JSON.stringify(j.raw) : '...');
    }
    const err = await res.text();
    console.warn('Huve proxy error', err);
  } catch (e) {
    console.warn('Huve proxy failed', e);
  }

  // Fallback to any existing window.claude.complete if present (older bundle)
  if (window.claude && typeof window.claude.complete === 'function') {
    try {
      const resp = await window.claude.complete({ messages: [ { role: 'user', content: `${sys}\n\n${user}` } ] });
      return typeof resp === 'string' ? resp : (resp.text || resp.content || '...');
    } catch (e) {
      return "I'm having a hiccup right now — try again in a sec! 🌵";
    }
  }

  return "AI not available (proxy missing).";
}

Object.assign(window, { SEED, DEFAULT_MOVE_DATE, MONTHLY_BUDGET, applyProgress, askHuve });
