# Life OS automations

Deploy this Edge Function with JWT verification disabled because both actions
perform their own authentication. `20260815000300_schedule_automations.sql`
creates an hourly Supabase cron job, generates a private token in Vault, and
stores only its SHA-256 digest in the API-facing schema. No cron credential is
committed to the repository. The browser invokes `{"action":"brief"}` with the
signed-in user's JWT; the scheduled `{"action":"run"}` request is accepted only
when its Vault token matches the stored digest.

Execution runs seven minutes past every hour for the 24-hour and 2-hour event
windows. Price, FX and Sunday-digest delivery remains deduplicated by the
database ledger, so the frequent schedule cannot send the same alert twice.

The worker queues notifications in `lifeos_notifications`; `notify` remains the
only APNs sender and should keep its existing one-to-two-minute schedule.
