-- 0013_prices.sql
--
-- Shared, source-attributed Abu Dhabi prices. Product and store identities are
-- readable by every signed-in member; personal watch targets remain private.
-- External feeds write with the service role inside the prices Edge Function.

create table if not exists public.lifeos_products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 180),
  brand text not null default '',
  barcode text,
  category text not null default 'Groceries',
  image_url text,
  is_sa_favourite boolean not null default false,
  submitted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists lifeos_products_barcode_unique_idx
  on public.lifeos_products (barcode)
  where barcode is not null and barcode <> '';
create index if not exists lifeos_products_name_search_idx
  on public.lifeos_products (lower(name));
create index if not exists lifeos_products_submitted_by_idx
  on public.lifeos_products (submitted_by);

create table if not exists public.lifeos_stores (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 160),
  area text not null default '',
  emirate text not null default 'Abu Dhabi',
  website_url text,
  submitted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists lifeos_stores_identity_unique_idx
  on public.lifeos_stores (lower(name), lower(area), lower(emirate));
create index if not exists lifeos_stores_submitted_by_idx
  on public.lifeos_stores (submitted_by);

create table if not exists public.lifeos_price_points (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.lifeos_products (id) on delete cascade,
  store_id uuid not null references public.lifeos_stores (id) on delete cascade,
  price numeric(12,2) not null check (price >= 0),
  currency text not null default 'AED' check (currency ~ '^[A-Z]{3}$'),
  source text not null check (source in ('amazon', 'openprices', 'community', 'estimate')),
  seen_at timestamptz not null default now(),
  submitted_by uuid references auth.users (id) on delete set null,
  submitted_name text not null default 'Community member',
  confidence numeric(4,3) not null default 1 check (confidence between 0 and 1),
  photo_path text,
  source_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lifeos_price_points_product_price_idx
  on public.lifeos_price_points (product_id, currency, price);
create index if not exists lifeos_price_points_store_seen_idx
  on public.lifeos_price_points (store_id, seen_at desc);
create index if not exists lifeos_price_points_seen_idx
  on public.lifeos_price_points (seen_at desc);
create index if not exists lifeos_price_points_submitted_by_idx
  on public.lifeos_price_points (submitted_by);
create unique index if not exists lifeos_price_points_source_reference_unique_idx
  on public.lifeos_price_points (source, source_reference)
  where source_reference is not null;

create table if not exists public.lifeos_price_watches (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  product_id uuid not null references public.lifeos_products (id) on delete cascade,
  target_price numeric(12,2) not null check (target_price >= 0),
  currency text not null default 'AED' check (currency ~ '^[A-Z]{3}$'),
  active boolean not null default true,
  last_notified_at timestamptz,
  last_notified_price numeric(12,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, product_id)
);

create index if not exists lifeos_price_watches_owner_active_idx
  on public.lifeos_price_watches (owner_id, active);
create index if not exists lifeos_price_watches_product_idx
  on public.lifeos_price_watches (product_id);

create table if not exists public.lifeos_deals (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.lifeos_products (id) on delete cascade,
  store_id uuid not null references public.lifeos_stores (id) on delete cascade,
  title text not null default '',
  current_price numeric(12,2) not null check (current_price >= 0),
  original_price numeric(12,2) check (original_price is null or original_price >= current_price),
  currency text not null default 'AED' check (currency ~ '^[A-Z]{3}$'),
  source text not null check (source in ('amazon', 'openprices', 'community', 'estimate')),
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  submitted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lifeos_deals_expiry_idx
  on public.lifeos_deals (expires_at, starts_at desc);
create index if not exists lifeos_deals_product_idx
  on public.lifeos_deals (product_id);
create index if not exists lifeos_deals_store_idx
  on public.lifeos_deals (store_id);
create index if not exists lifeos_deals_submitted_by_idx
  on public.lifeos_deals (submitted_by);

create or replace function public.lifeos_prices_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.lifeos_prices_touch_updated_at() from public, anon, authenticated;

create or replace function public.lifeos_attribute_community_price()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.source = 'community' and auth.uid() is not null then
    new.submitted_by := auth.uid();
    select coalesce(nullif(btrim(profile.display_name), ''), 'Community member')
      into new.submitted_name
    from public.lifeos_profiles profile
    where profile.user_id = auth.uid();
    new.submitted_name := coalesce(new.submitted_name, 'Community member');
  end if;
  return new;
end;
$$;

revoke all on function public.lifeos_attribute_community_price() from public, anon, authenticated;

drop trigger if exists lifeos_products_touch_updated_at on public.lifeos_products;
create trigger lifeos_products_touch_updated_at before update on public.lifeos_products
for each row execute function public.lifeos_prices_touch_updated_at();

drop trigger if exists lifeos_stores_touch_updated_at on public.lifeos_stores;
create trigger lifeos_stores_touch_updated_at before update on public.lifeos_stores
for each row execute function public.lifeos_prices_touch_updated_at();

drop trigger if exists lifeos_price_points_touch_updated_at on public.lifeos_price_points;
create trigger lifeos_price_points_touch_updated_at before update on public.lifeos_price_points
for each row execute function public.lifeos_prices_touch_updated_at();

drop trigger if exists lifeos_price_points_attribute_author on public.lifeos_price_points;
create trigger lifeos_price_points_attribute_author before insert or update on public.lifeos_price_points
for each row execute function public.lifeos_attribute_community_price();

drop trigger if exists lifeos_price_watches_touch_updated_at on public.lifeos_price_watches;
create trigger lifeos_price_watches_touch_updated_at before update on public.lifeos_price_watches
for each row execute function public.lifeos_prices_touch_updated_at();

drop trigger if exists lifeos_deals_touch_updated_at on public.lifeos_deals;
create trigger lifeos_deals_touch_updated_at before update on public.lifeos_deals
for each row execute function public.lifeos_prices_touch_updated_at();

alter table public.lifeos_products enable row level security;
alter table public.lifeos_stores enable row level security;
alter table public.lifeos_price_points enable row level security;
alter table public.lifeos_price_watches enable row level security;
alter table public.lifeos_deals enable row level security;

revoke all on table public.lifeos_products from public, anon, authenticated;
revoke all on table public.lifeos_stores from public, anon, authenticated;
revoke all on table public.lifeos_price_points from public, anon, authenticated;
revoke all on table public.lifeos_price_watches from public, anon, authenticated;
revoke all on table public.lifeos_deals from public, anon, authenticated;

grant select, insert, update, delete on table public.lifeos_products to authenticated;
grant select, insert, update, delete on table public.lifeos_stores to authenticated;
grant select, insert, update, delete on table public.lifeos_price_points to authenticated;
grant select, insert, update, delete on table public.lifeos_price_watches to authenticated;
grant select, insert, update, delete on table public.lifeos_deals to authenticated;

create policy "members read products" on public.lifeos_products
for select to authenticated using (true);
create policy "authors insert products" on public.lifeos_products
for insert to authenticated with check (submitted_by = (select auth.uid()));
create policy "authors update products" on public.lifeos_products
for update to authenticated using (submitted_by = (select auth.uid()))
with check (submitted_by = (select auth.uid()));
create policy "authors delete products" on public.lifeos_products
for delete to authenticated using (submitted_by = (select auth.uid()));

create policy "members read stores" on public.lifeos_stores
for select to authenticated using (true);
create policy "authors insert stores" on public.lifeos_stores
for insert to authenticated with check (submitted_by = (select auth.uid()));
create policy "authors update stores" on public.lifeos_stores
for update to authenticated using (submitted_by = (select auth.uid()))
with check (submitted_by = (select auth.uid()));
create policy "authors delete stores" on public.lifeos_stores
for delete to authenticated using (submitted_by = (select auth.uid()));

create policy "members read price points" on public.lifeos_price_points
for select to authenticated using (true);
create policy "members log community prices" on public.lifeos_price_points
for insert to authenticated with check (
  submitted_by = (select auth.uid()) and source = 'community'
);
create policy "authors update price points" on public.lifeos_price_points
for update to authenticated using (submitted_by = (select auth.uid()))
with check (submitted_by = (select auth.uid()) and source = 'community');
create policy "authors delete price points" on public.lifeos_price_points
for delete to authenticated using (submitted_by = (select auth.uid()));

create policy "owners read price watches" on public.lifeos_price_watches
for select to authenticated using (owner_id = (select auth.uid()));
create policy "owners insert price watches" on public.lifeos_price_watches
for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "owners update price watches" on public.lifeos_price_watches
for update to authenticated using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));
create policy "owners delete price watches" on public.lifeos_price_watches
for delete to authenticated using (owner_id = (select auth.uid()));

create policy "members read deals" on public.lifeos_deals
for select to authenticated using (true);
create policy "authors insert deals" on public.lifeos_deals
for insert to authenticated with check (submitted_by = (select auth.uid()));
create policy "authors update deals" on public.lifeos_deals
for update to authenticated using (submitted_by = (select auth.uid()))
with check (submitted_by = (select auth.uid()));
create policy "authors delete deals" on public.lifeos_deals
for delete to authenticated using (submitted_by = (select auth.uid()));

-- Useful identities are seeded without inventing price data. Feed and
-- community observations populate price points later with an explicit source.
insert into public.lifeos_products (name, brand, category, is_sa_favourite)
select seed.name, seed.brand, seed.category, true
from (values
  ('Biltong', '', 'South African favourites'),
  ('Rooibos tea', '', 'South African favourites'),
  ('Mrs Ball''s chutney', 'Mrs Ball''s', 'South African favourites'),
  ('Boerewors spice', '', 'South African favourites')
) as seed(name, brand, category)
where not exists (
  select 1 from public.lifeos_products product
  where lower(product.name) = lower(seed.name) and lower(product.brand) = lower(seed.brand)
);

insert into public.lifeos_stores (name, area, emirate)
select seed.name, seed.area, 'Abu Dhabi'
from (values
  ('Spinneys', 'Khalifa City'),
  ('Carrefour', 'Abu Dhabi'),
  ('Lulu Hypermarket', 'Forsan Central Mall'),
  ('Amazon.ae', 'Online')
) as seed(name, area)
where not exists (
  select 1 from public.lifeos_stores store
  where lower(store.name) = lower(seed.name)
    and lower(store.area) = lower(seed.area)
    and lower(store.emirate) = 'abu dhabi'
);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'lifeos_price_points'
    ) then
      alter publication supabase_realtime add table public.lifeos_price_points;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'lifeos_price_watches'
    ) then
      alter publication supabase_realtime add table public.lifeos_price_watches;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'lifeos_deals'
    ) then
      alter publication supabase_realtime add table public.lifeos_deals;
    end if;
  end if;
end;
$$;
