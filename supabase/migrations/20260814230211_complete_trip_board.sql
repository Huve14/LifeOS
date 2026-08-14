-- Complete, private Trip board for every Life OS account.
--
-- This migration is deliberately additive. The production project does not
-- have Trip tables yet, so no legacy data or columns are removed.

create table public.lifeos_trips (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (length(btrim(title)) > 0),
  origin text not null default '',
  destination text not null default '',
  start_date date not null,
  end_date date not null,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lifeos_trips_dates_ordered check (end_date >= start_date)
);

create index lifeos_trips_owner_start_idx
  on public.lifeos_trips (owner_id, start_date desc);

create table public.lifeos_trip_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  trip_id uuid not null references public.lifeos_trips (id) on delete cascade,
  client_id text not null unique,
  category text not null default 'idea'
    check (category in ('flight', 'hotel', 'transport', 'booking', 'activity', 'checklist', 'idea')),
  title text not null check (length(btrim(title)) > 0),
  starts_at timestamptz,
  ends_at timestamptz,
  cost_amount numeric(12, 2) check (cost_amount is null or cost_amount >= 0),
  cost_currency text not null default 'AED',
  booking_ref text not null default '',
  status text not null default 'tentative'
    check (status in ('confirmed', 'tentative')),
  notes text not null default '',
  url text not null default '',
  is_complete boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lifeos_trip_items_times_ordered
    check (ends_at is null or starts_at is null or ends_at >= starts_at)
);

create index lifeos_trip_items_owner_trip_time_idx
  on public.lifeos_trip_items (owner_id, trip_id, starts_at);

alter table public.lifeos_trips enable row level security;
alter table public.lifeos_trip_items enable row level security;

create policy "owners read trips"
on public.lifeos_trips for select to authenticated
using ((select auth.uid()) = owner_id);

create policy "owners create trips"
on public.lifeos_trips for insert to authenticated
with check ((select auth.uid()) = owner_id);

create policy "owners update trips"
on public.lifeos_trips for update to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

create policy "owners delete trips"
on public.lifeos_trips for delete to authenticated
using ((select auth.uid()) = owner_id);

create policy "owners read trip items"
on public.lifeos_trip_items for select to authenticated
using ((select auth.uid()) = owner_id);

create policy "owners create trip items"
on public.lifeos_trip_items for insert to authenticated
with check (
  (select auth.uid()) = owner_id
  and exists (
    select 1 from public.lifeos_trips t
    where t.id = trip_id and t.owner_id = (select auth.uid())
  )
);

create policy "owners update trip items"
on public.lifeos_trip_items for update to authenticated
using ((select auth.uid()) = owner_id)
with check (
  (select auth.uid()) = owner_id
  and exists (
    select 1 from public.lifeos_trips t
    where t.id = trip_id and t.owner_id = (select auth.uid())
  )
);

create policy "owners delete trip items"
on public.lifeos_trip_items for delete to authenticated
using ((select auth.uid()) = owner_id);

-- New Supabase projects do not expose new public tables to the Data API by
-- default. RLS above remains the authorization boundary.
grant select, insert, update, delete on public.lifeos_trips to authenticated;
grant select, insert, update, delete on public.lifeos_trip_items to authenticated;

alter publication supabase_realtime add table public.lifeos_trips;
alter publication supabase_realtime add table public.lifeos_trip_items;
