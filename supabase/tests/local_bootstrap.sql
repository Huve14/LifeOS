-- Minimal Supabase platform fixtures for syntax-checking the ordered app
-- migrations against a disposable local PostgreSQL cluster.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end;
$$;

create schema auth;
create schema storage;
create schema extensions;
create extension pgcrypto with schema extensions;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant execute on function auth.jwt() to anon, authenticated, service_role;

create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text not null
);
alter table storage.objects enable row level security;
create function storage.foldername(input text) returns text[]
language sql immutable as $$ select string_to_array(input, '/') $$;

create table public.suveda_app_state (
  id text primary key,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create table public.suveda_chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id text not null,
  role text not null,
  text text not null,
  created_at timestamptz not null default now()
);
create table public.suveda_shopping_items (
  id uuid primary key default gen_random_uuid(),
  category text not null default 'Essentials',
  item text not null,
  quantity text not null default '',
  price integer not null default 0,
  supplied_by text not null default '',
  note text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.suveda_share_tokens (
  token text primary key,
  name text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.suveda_app_state enable row level security;
alter table public.suveda_chat_messages enable row level security;
alter table public.suveda_shopping_items enable row level security;
alter table public.suveda_share_tokens enable row level security;

create publication supabase_realtime;
