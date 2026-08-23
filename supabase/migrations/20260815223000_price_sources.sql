-- 20260815223000_price_sources.sql
--
-- Shop & Save could never show a live special. `lifeos_deals` only ever gained
-- rows from a community member ticking "this is a special", or from an Open
-- Prices row that happened to carry a discount flag -- and Open Prices has
-- effectively no AED coverage. Retailer ingestion was impossible because
-- `source` was pinned to a four-value CHECK.
--
-- This replaces that CHECK with a source registry so adding an Abu Dhabi or
-- Dubai retailer is a row insert rather than a migration, and gives scheduled
-- ingestion the dedupe key and per-source health reporting it needs.

create table if not exists public.lifeos_price_sources (
  slug text primary key check (slug ~ '^[a-z0-9][a-z0-9_-]{1,38}[a-z0-9]$'),
  label text not null check (length(btrim(label)) between 1 and 120),
  kind text not null default 'retailer'
    check (kind in ('retailer', 'aggregator', 'catalog', 'community', 'estimate')),
  emirates text[] not null default '{}'::text[],
  homepage_url text,
  enabled boolean not null default true,
  -- Health, written by the ingestion runner so the app can show which feeds
  -- are actually alive instead of silently rendering an empty Deals tab.
  last_run_at timestamptz,
  last_success_at timestamptz,
  last_status text not null default 'pending'
    check (last_status in ('pending', 'ok', 'empty', 'error', 'skipped')),
  last_error text,
  items_last_run integer not null default 0 check (items_last_run >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lifeos_price_sources_enabled_idx
  on public.lifeos_price_sources (enabled, kind);

drop trigger if exists lifeos_price_sources_touch_updated_at on public.lifeos_price_sources;
create trigger lifeos_price_sources_touch_updated_at before update on public.lifeos_price_sources
for each row execute function public.lifeos_prices_touch_updated_at();

-- The four historical sources must exist before the foreign keys are added,
-- otherwise existing price points and deals would fail validation.
insert into public.lifeos_price_sources (slug, label, kind, emirates, homepage_url)
values
  ('community',  'Community member', 'community', '{Abu Dhabi,Dubai}', null),
  ('estimate',   'AI estimate',      'estimate',  '{Abu Dhabi,Dubai}', null),
  ('openprices', 'Open Prices',      'catalog',   '{Abu Dhabi,Dubai}', 'https://prices.openfoodfacts.org'),
  ('amazon',     'Amazon.ae',        'retailer',  '{Abu Dhabi,Dubai}', 'https://www.amazon.ae')
on conflict (slug) do nothing;

-- Flyer aggregators carry many retailers behind a single adapter, so they are
-- the widest coverage per unit of maintenance.
insert into public.lifeos_price_sources (slug, label, kind, emirates, homepage_url)
values
  ('clicflyer',    'ClicFlyer',     'aggregator', '{Abu Dhabi,Dubai}', 'https://clicflyer.com'),
  ('tiendeo',      'Tiendeo UAE',   'aggregator', '{Abu Dhabi,Dubai}', 'https://www.tiendeo.ae'),
  ('clicoffer',    'ClicOffer',     'aggregator', '{Abu Dhabi,Dubai}', 'https://www.clicoffer.com'),
  ('leafletstore', 'Leaflet Store', 'aggregator', '{Abu Dhabi,Dubai}', 'https://leafletstore.com')
on conflict (slug) do nothing;

-- Direct retailers across both emirates.
insert into public.lifeos_price_sources (slug, label, kind, emirates, homepage_url)
values
  ('carrefour',  'Carrefour UAE',        'retailer', '{Abu Dhabi,Dubai}', 'https://www.carrefouruae.com'),
  ('lulu',       'Lulu Hypermarket',     'retailer', '{Abu Dhabi,Dubai}', 'https://www.luluhypermarket.com'),
  ('spinneys',   'Spinneys',             'retailer', '{Abu Dhabi,Dubai}', 'https://www.spinneys.com'),
  ('choithrams', 'Choithrams',           'retailer', '{Abu Dhabi,Dubai}', 'https://www.choithrams.com'),
  ('nesto',      'Nesto Hypermarket',    'retailer', '{Abu Dhabi,Dubai}', 'https://nestogroup.com'),
  ('viva',       'Viva Supermarket',     'retailer', '{Abu Dhabi,Dubai}', 'https://www.viva.luluhypermarket.com'),
  ('almaya',     'Al Maya Supermarket',  'retailer', '{Abu Dhabi,Dubai}', 'https://www.almaya.ae'),
  ('westzone',   'West Zone Fresh',      'retailer', '{Abu Dhabi,Dubai}', 'https://westzonefresh.com'),
  ('earth',      'Earth Supermarket',    'retailer', '{Abu Dhabi,Dubai}', 'https://earthsupermarket.com'),
  ('grandiose',  'Grandiose Supermarket','retailer', '{Abu Dhabi,Dubai}', 'https://www.grandiose.ae'),
  ('unioncoop',  'Union Coop',           'retailer', '{Dubai}',           'https://www.unioncoop.ae'),
  ('aswaaq',     'Aswaaq',               'retailer', '{Dubai}',           'https://www.aswaaq.ae'),
  ('kibsons',    'Kibsons',              'retailer', '{Dubai}',           'https://www.kibsons.com'),
  ('noon',       'noon',                 'retailer', '{Abu Dhabi,Dubai}', 'https://www.noon.com'),
  ('talabat',    'talabat mart',         'retailer', '{Abu Dhabi,Dubai}', 'https://www.talabat.com'),
  ('instashop',  'InstaShop',            'retailer', '{Abu Dhabi,Dubai}', 'https://instashop.com')
on conflict (slug) do nothing;

-- Swap the closed CHECK for the registry. Constraint names are the defaults
-- PostgreSQL generated for the inline checks in 0013_prices.sql.
alter table public.lifeos_price_points drop constraint if exists lifeos_price_points_source_check;
alter table public.lifeos_deals drop constraint if exists lifeos_deals_source_check;

alter table public.lifeos_price_points drop constraint if exists lifeos_price_points_source_fkey;
alter table public.lifeos_price_points
  add constraint lifeos_price_points_source_fkey
  foreign key (source) references public.lifeos_price_sources (slug)
  on update cascade;

alter table public.lifeos_deals drop constraint if exists lifeos_deals_source_fkey;
alter table public.lifeos_deals
  add constraint lifeos_deals_source_fkey
  foreign key (source) references public.lifeos_price_sources (slug)
  on update cascade;

create index if not exists lifeos_price_points_source_idx on public.lifeos_price_points (source);
create index if not exists lifeos_deals_source_idx on public.lifeos_deals (source);

-- Deals had no idempotency key, so a scheduled re-run would have duplicated
-- every special on every pass.
alter table public.lifeos_deals add column if not exists source_reference text;

create unique index if not exists lifeos_deals_source_reference_unique_idx
  on public.lifeos_deals (source, source_reference)
  where source_reference is not null;

-- The live-deal lookup (starts_at <= now, expires_at null or in future,
-- ordered by expiry) is already served by lifeos_deals_expiry_idx from
-- 0013_prices.sql, so no additional index is added here. A partial index
-- predicate could not use now() in any case -- it is not IMMUTABLE.

alter table public.lifeos_price_sources enable row level security;
revoke all on table public.lifeos_price_sources from public, anon, authenticated;
grant select on table public.lifeos_price_sources to authenticated;

-- Members may read feed health so the UI can say which sources are live.
-- Only the service role inside the Edge Function writes to this table.
create policy "members read price sources" on public.lifeos_price_sources
for select to authenticated using (true);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'lifeos_price_sources'
    ) then
      alter publication supabase_realtime add table public.lifeos_price_sources;
    end if;
  end if;
end;
$$;
