-- Covers cascade deletes and direct item lookups by the trip foreign key.
create index lifeos_trip_items_trip_id_idx
  on public.lifeos_trip_items (trip_id);
