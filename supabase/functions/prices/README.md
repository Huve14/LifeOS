# Prices Edge Function

Deploy with JWT verification enabled. The app invokes this function through
the authenticated Supabase client; it is the only place allowed to call price
and currency sources.

## Actions

| Action | Caller | Purpose |
| --- | --- | --- |
| `lookup` | signed-in member | Identify a product and import prices for it |
| `fx` | signed-in member | AED/ZAR reference rate |
| `refresh-deals` | pg_cron, or a signed-in member | Read every enabled source and store live specials |

`refresh-deals` accepts an optional `slugs` array to refresh a single source,
which is the quickest way to debug one retailer after deploy.

## Sources

Built-in public sources need no secrets:

- Open Food Facts product identity
- Open Prices community observations
- Frankfurter AED/ZAR reference rate
- The Abu Dhabi and Dubai retailers and flyer aggregators in
  `sources/catalogue.ts`

Retailer pages are read through one shared schema.org parser
(`sources/structured-data.ts`) rather than a bespoke scraper per site. Almost
every retail platform publishes Product/Offer JSON-LD for search engines, so a
single spec-shaped reader covers many retailers and degrades predictably when
one stops publishing it.

Ingestion honours `robots.txt` per host, applies any `Crawl-delay`, spaces
requests out, and times each page out. Sources run isolated from one another:
one blocked or broken retailer cannot empty the Deals tab or fail the run.

## Reading source health after a deploy

Nothing in CI can reach these hosts, so the URLs in `sources/catalogue.ts` are
starting points confirmed by the first production run, not verified endpoints.
After deploying, check the registry rather than assuming:

```sql
select slug, last_status, items_last_run, last_error, last_run_at
from public.lifeos_price_sources
order by last_status, slug;
```

- `ok` — publishing structured data we can read
- `empty` — reachable, but nothing parseable; needs a bespoke reader
- `error` — blocked, down, or returning a non-200; `last_error` says which
- `skipped` — disabled in the registry, or every path is disallowed by robots.txt

Disable a source without a deploy:

```sql
update public.lifeos_price_sources set enabled = false where slug = 'noon';
```

## Secrets

Optional, server-only:

- `NVIDIA_API_KEY` for visibly labelled fallback estimates
- `NVIDIA_MODEL` to override the existing Nemotron model
- `PRICES_CRON_SECRET` (falls back to `AUTOMATIONS_CRON_SECRET`, then to the
  hashed token in `lifeos_automation_cron_tokens`) for the scheduled refresh
- `AMAZON_CREATORS_CREDENTIALS` once an approved Amazon UAE successor-feed
  integration is available. The retired PA-API is deliberately not called.

Never add any of these as `VITE_*` variables: those are compiled into the
browser bundle.
