# Implementation decisions

## Trip ownership

The production Supabase project has the owner-private Trip model created by
`20260814230211_complete_trip_board.sql`: `lifeos_trips.owner_id` and
`lifeos_trip_items.owner_id` exist, and neither table has `space_id`.

Life OS therefore keeps trips private to their owner. The migration history is
not rewritten. A guarded preflight quarantines the obsolete space-scoped tables
only on a fresh replay, and an append-only follow-up copies their data into the
owner-private schema. Both migrations are no-ops against the current production
shape.

The replay also exposed two older ordering dependencies around the retired
`lifeos_members` table. Ordered compatibility migrations remove its dependent
policies before 0009, recreate a bounded backfill table for 0012 and the private
account migration, then remove it. `scripts/verify-migration-chain.sh` proves the
complete sequence against a disposable PostgreSQL cluster.

## Budget engine

The live application continues to use `src/lifeos/budget.ts`. The separate
`src/budget/` package remains a tested forecasting library for now and is brought
into TypeScript and ESLint coverage; it is not silently wired into the legacy UI.
AED/ZAR presentation belongs in the live `src/lifeos` service layer when added.
