# Life OS automations

Deploy this Edge Function with JWT verification enabled. Set
`AUTOMATIONS_CRON_SECRET`, then schedule an hourly authenticated POST containing
`{"action":"run"}` and the same value in `x-cron-secret`. The browser invokes
`{"action":"brief"}` with the signed-in user's JWT.

Hourly execution is required for the 24-hour and 2-hour event windows. Price,
FX and Sunday-digest delivery remains deduplicated by the database ledger, so
the more frequent schedule cannot send the same alert twice.

The worker queues notifications in `lifeos_notifications`; `notify` remains the
only APNs sender and should keep its existing one-to-two-minute schedule.
