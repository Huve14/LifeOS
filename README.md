Moving Abroad

A warm, opinionated companion for moving abroad — built for Users move from South Africa to Al Khalifa City, Abu Dhabi.

## Features

- **8 modules** to track every aspect of the move: Packing, Documents, Timeline, Budget, Shopping, Housing, Memory Lane, and People & Contacts
- **AI companion** (Huve) — intelligent chat powered by NVIDIA Nemotron, aware of your countdown and tasks
- **Daily check-in** — Huve greets you by name with your remaining days and soonest task
- **Onboarding** with embedded auth — spinning globe intro, name/password signup, date picker
- **Supabase persistence** — state, chat, and shopping list sync across devices
- **Shared shopping list** — standalone page for family to view/claim items, real-time via Supabase
- **Dark mode** and theme accent picker (terracotta / teal / gold)
- **Budget planner** — monthly (AED 8,800 income) + one-time move costs, with ZAR home-currency comparison
- **First 48 Hours guide** — arrival essentials: SIM, groceries, mosque, first meal, transport
- **Memory Lane** — "last times" and goodbyes to honour the place you're leaving
- **"Why I'm doing this"** — editable anchor note pinned to the dashboard
- **Confetti celebrations** when you complete a module
- **South African rand (ZAR)** on the shopping list

## Stack

- **React** — app shell with JSX modules
- **Supabase** — auth, database, realtime subscriptions
- **Vite** — build tool, multi-page entry for shared list
- **Vercel** — deployment
- **Cloudflare Worker** — AI proxy (free tier, bypasses Vercel's 10s timeout)
- **NVIDIA Nemotron** — reasoning AI model via `enable_thinking: true`

## Architecture

```
index.html → src/main.tsx → src/legacy-entry.ts
  ├── initAuth() — restores Supabase session
  ├── createSuvedaStore() — Supabase or localStorage
  └── renders <Root> → <App>
       ├── Loading (auth + storage ready)
       ├── Onboarding (with auth if no user)
       └── Dashboard + Module Screens + Bottom Nav

Shared list: shared.html → src/shared-entry.tsx → shared-list.jsx
AI proxy: server.cjs (local) / worker/index.js (Cloudflare)
API: window.__suvedaApiUrl → Cloudflare Worker → NVIDIA API
```

## Environment

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `VITE_API_URL` | AI proxy endpoint (Cloudflare Worker) |
| `NVIDIA_API_KEY` | NVIDIA API key (Worker secret) |

## Local dev

```bash
npm install
npm run dev        # Vite on :5173
node server.cjs    # AI proxy on :3001
```

Set `VITE_API_URL=http://localhost:3001` in `.env.local` for the local AI proxy.

## Deploy

```bash
npx vercel --prod
```

The shared page is a separate build entry (`shared.html`) and is accessible at `/s/:token`.

## License

Private — for Suveda's move to Abu Dhabi 🌴
