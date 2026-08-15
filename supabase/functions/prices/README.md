# Prices Edge Function

Deploy with JWT verification enabled. The app invokes this function through
the authenticated Supabase client; it is the only place allowed to call price
and currency sources.

Built-in public sources need no secrets:

- Open Food Facts product identity
- Open Prices community observations
- Frankfurter AED/ZAR reference rate

Optional server-only secrets:

- `NVIDIA_API_KEY` for visibly labelled fallback estimates
- `NVIDIA_MODEL` to override the existing Nemotron model
- `AMAZON_CREATORS_CREDENTIALS` once an approved Amazon UAE successor-feed
  integration is available. The retired PA-API is deliberately not called.

Never add any of these as `VITE_*` variables: those are compiled into the
browser bundle.
