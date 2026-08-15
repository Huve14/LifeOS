-- Complete the append-only Trip schema reconciliation begun by
-- 00129999999999_quarantine_legacy_trip_tables.sql.

do $$
begin
  if to_regclass('lifeos_trip_legacy.lifeos_trips') is null then
    drop schema if exists lifeos_trip_legacy;
    return;
  end if;

  insert into public.lifeos_trips (
    id, owner_id, title, origin, destination, start_date, end_date, notes,
    created_at, updated_at
  )
  select
    trip.id, trip.created_by, trip.title, trip.origin, trip.destination,
    trip.start_date, trip.end_date, trip.notes, trip.created_at, trip.updated_at
  from lifeos_trip_legacy.lifeos_trips trip
  on conflict (id) do nothing;

  insert into public.lifeos_trip_items (
    id, owner_id, trip_id, client_id, category, title, starts_at, ends_at,
    cost_amount, cost_currency, booking_ref, status, notes, url,
    is_complete, sort_order, created_at, updated_at
  )
  select
    item.id, trip.owner_id, item.trip_id, item.client_id, item.category,
    item.title, item.starts_at, item.ends_at, item.cost_amount,
    item.cost_currency, item.booking_ref, item.status, item.notes, item.url,
    false, 0, item.created_at, item.updated_at
  from lifeos_trip_legacy.lifeos_trip_items item
  join public.lifeos_trips trip on trip.id = item.trip_id
  on conflict do nothing;

  drop table lifeos_trip_legacy.lifeos_trip_items;
  drop table lifeos_trip_legacy.lifeos_trips;
  drop schema lifeos_trip_legacy;
end;
$$;
