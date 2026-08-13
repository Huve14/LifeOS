-- 0006_lifeos_trips.sql
--
-- Shared trip board. A trip holds dates and a route; items hang off it as
-- flights, hotels, bookings and ideas.
--
-- Unlike the video journal and the prompt, nothing here is author scoped.
-- Both of us can add and edit anything, because a trip plan that only one
-- person can correct is worse than useless. created_by and updated_by are
-- recorded so the board can show who touched what, not to restrict anyone.
--
-- Requires 0001_lifeos_members.sql.

create table if not exists public.lifeos_trips (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) > 0),
  origin text not null default '',
  destination text not null default '',
  start_date date not null,
  end_date date not null,
  notes text not null default '',
  created_by uuid not null default auth.uid() references auth.users (id) on delete set default,
  updated_by uuid not null default auth.uid() references auth.users (id) on delete set default,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint lifeos_trips_dates_ordered check (end_date >= start_date)
);

create index if not exists lifeos_trips_start_idx
  on public.lifeos_trips (start_date desc);

create table if not exists public.lifeos_trip_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.lifeos_trips (id) on delete cascade,

  -- Device-generated, so a queued create or edit can be retried without
  -- duplicating and without needing the server id first.
  client_id text not null unique,

  category text not null default 'idea'
    check (category in ('flight', 'hotel', 'booking', 'idea')),
  title text not null check (length(btrim(title)) > 0),

  -- Null for an idea that has no time attached yet. Sorted last when so.
  starts_at timestamptz,
  ends_at timestamptz,

  cost_amount numeric(12, 2),
  cost_currency text not null default 'AED',
  booking_ref text not null default '',
  status text not null default 'tentative'
    check (status in ('confirmed', 'tentative')),
  notes text not null default '',
  url text not null default '',

  created_by uuid not null default auth.uid() references auth.users (id) on delete set default,
  updated_by uuid not null default auth.uid() references auth.users (id) on delete set default,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint lifeos_trip_items_times_ordered
    check (ends_at is null or starts_at is null or ends_at >= starts_at)
);

create index if not exists lifeos_trip_items_trip_idx
  on public.lifeos_trip_items (trip_id, starts_at);

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------

alter table public.lifeos_trips enable row level security;
alter table public.lifeos_trip_items enable row level security;

-- Both members, full access. The allowlist is the boundary here, not authorship.
drop policy if exists "members manage trips" on public.lifeos_trips;
create policy "members manage trips"
on public.lifeos_trips
for all
to authenticated
using (public.is_member())
with check (public.is_member());

drop policy if exists "members manage trip items" on public.lifeos_trip_items;
create policy "members manage trip items"
on public.lifeos_trip_items
for all
to authenticated
using (public.is_member())
with check (public.is_member());

-- Two people editing the same board need to see each other's changes, or they
-- will both fix the same wrong flight time.
do $$
begin
  alter publication supabase_realtime add table public.lifeos_trips;
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.lifeos_trip_items;
exception
  when duplicate_object then null;
end;
$$;
