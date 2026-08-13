-- 0007_lifeos_trip_seed.sql
--
-- The first trip: October, Johannesburg to Abu Dhabi.
--
-- Only the trip itself is seeded. No flights, hotels or bookings are invented
-- here, because a placeholder booking reference that looks real is worse than
-- an empty board. Add the real ones in the app.
--
-- The dates below span the whole month as a starting point. Narrow them once
-- the flights are booked; the trip is editable from the board.
--
-- Requires 0006_lifeos_trips.sql.

insert into public.lifeos_trips (title, origin, destination, start_date, end_date, notes, created_by, updated_by)
select
  'October in Abu Dhabi',
  'Johannesburg',
  'Abu Dhabi',
  date '2026-10-01',
  date '2026-10-31',
  'Dates are the whole month for now. Tighten them once flights are booked.',
  m.user_id,
  m.user_id
from public.lifeos_members m
order by m.created_at
limit 1
on conflict do nothing;

-- Verify: expect one row.
-- select title, start_date, end_date from public.lifeos_trips;
