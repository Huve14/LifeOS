# Suveda

Suveda is a moving-to-Abu-Dhabi planning app with a Supabase-backed state store and chat history.

## Setup

1. Copy `.env.example` to `.env.local`.
2. Fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
3. Run the SQL in `supabase/schema.sql` in your Supabase project.
4. Install dependencies and start the app:

```bash
npm install
npm run dev
```

## Data Model

- `suveda_app_state` stores the current app snapshot.
- `suveda_chat_messages` stores the Huve chat transcript.

If Supabase is not configured, the app falls back to local browser storage so it still runs.
