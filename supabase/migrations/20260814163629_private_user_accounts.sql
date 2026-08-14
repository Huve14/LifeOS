-- Applied to production as migration version 20260814163629.
-- Rebrand the persistence layer around Life OS accounts and make every
-- ordinary application row owner-scoped. A signup receives one private
-- profile row and one private state row; we deliberately do not create a new
-- physical table per user because RLS on a shared table is safer to audit and
-- scales without unbounded schema objects.

-- ---------------------------------------------------------------------------
-- Private per-account state and chat
-- ---------------------------------------------------------------------------

create table if not exists public.lifeos_user_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lifeos_chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'ai')),
  text text not null,
  created_at timestamptz not null default now()
);

create index if not exists lifeos_chat_messages_user_created_idx
  on public.lifeos_chat_messages (user_id, created_at);

alter table public.lifeos_user_state enable row level security;
alter table public.lifeos_chat_messages enable row level security;

revoke all on table public.lifeos_user_state from public, anon, authenticated;
revoke all on table public.lifeos_chat_messages from public, anon, authenticated;
grant select, insert, update on table public.lifeos_user_state to authenticated;
grant select, insert, delete on table public.lifeos_chat_messages to authenticated;

drop policy if exists "read own user state" on public.lifeos_user_state;
create policy "read own user state"
on public.lifeos_user_state for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "insert own user state" on public.lifeos_user_state;
create policy "insert own user state"
on public.lifeos_user_state for insert to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists "update own user state" on public.lifeos_user_state;
create policy "update own user state"
on public.lifeos_user_state for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists "read own chat messages" on public.lifeos_chat_messages;
create policy "read own chat messages"
on public.lifeos_chat_messages for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "insert own chat messages" on public.lifeos_chat_messages;
create policy "insert own chat messages"
on public.lifeos_chat_messages for insert to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists "delete own chat messages" on public.lifeos_chat_messages;
create policy "delete own chat messages"
on public.lifeos_chat_messages for delete to authenticated
using (user_id = (select auth.uid()));

-- Preserve every already-owned UUID row. The historical `suveda-main` row and
-- `main` chat belonged to the original account; adopt them only for that
-- account and prefer whichever state copy is newer.
insert into public.lifeos_user_state (user_id, payload, updated_at)
select s.id::uuid, s.payload, s.updated_at
from public.suveda_app_state s
join auth.users u on u.id::text = s.id
where s.id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
on conflict (user_id) do update
set payload = excluded.payload,
    updated_at = excluded.updated_at
where excluded.updated_at > public.lifeos_user_state.updated_at;

do $$
declare
  legacy_owner uuid;
begin
  select u.id into legacy_owner
  from auth.users u
  where lower(u.email) in ('suvedap@gmail.com', 'suveda@suveda.app')
  order by case when lower(u.email) = 'suvedap@gmail.com' then 0 else 1 end
  limit 1;

  if legacy_owner is not null then
    insert into public.lifeos_user_state (user_id, payload, updated_at)
    select legacy_owner, s.payload, s.updated_at
    from public.suveda_app_state s
    where s.id = 'suveda-main'
    on conflict (user_id) do update
    set payload = excluded.payload,
        updated_at = excluded.updated_at
    where excluded.updated_at > public.lifeos_user_state.updated_at;

    insert into public.lifeos_chat_messages (id, user_id, role, text, created_at)
    select m.id, legacy_owner, m.role, m.text, m.created_at
    from public.suveda_chat_messages m
    where m.thread_id = 'main'
    on conflict (id) do nothing;
  end if;
end;
$$;

insert into public.lifeos_chat_messages (id, user_id, role, text, created_at)
select m.id, m.thread_id::uuid, m.role, m.text, m.created_at
from public.suveda_chat_messages m
join auth.users u on u.id::text = m.thread_id
where m.thread_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
on conflict (id) do nothing;

-- The legacy tables remain as a recoverable archive, but are no longer part
-- of the Data API surface for browser roles.
drop policy if exists "user or legacy app state" on public.suveda_app_state;
drop policy if exists "user owns app state" on public.suveda_app_state;
drop policy if exists "read write app state" on public.suveda_app_state;
drop policy if exists "user or legacy chat messages" on public.suveda_chat_messages;
drop policy if exists "user owns chat messages" on public.suveda_chat_messages;
drop policy if exists "read write chat messages" on public.suveda_chat_messages;
revoke all on table public.suveda_app_state from public, anon, authenticated;
revoke all on table public.suveda_chat_messages from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Private profile provisioning
-- ---------------------------------------------------------------------------

create or replace function public.lifeos_touch_profile_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.lifeos_touch_profile_updated_at() from public, anon, authenticated;

drop trigger if exists lifeos_profiles_touch_updated_at on public.lifeos_profiles;
create trigger lifeos_profiles_touch_updated_at
before update on public.lifeos_profiles
for each row execute function public.lifeos_touch_profile_updated_at();

create or replace function public.lifeos_handle_new_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  new_name text;
begin
  new_name := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Member'
  );

  insert into public.lifeos_profiles (user_id, display_name, handle)
  values (new.id, new_name, public.lifeos_make_handle(new_name, new.id))
  on conflict (user_id) do update
  set display_name = case
    when public.lifeos_profiles.display_name = '' then excluded.display_name
    else public.lifeos_profiles.display_name
  end;

  insert into public.lifeos_user_state (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

revoke all on function public.lifeos_handle_new_user() from public, anon, authenticated;

drop trigger if exists lifeos_on_auth_user_created on auth.users;
create trigger lifeos_on_auth_user_created
after insert on auth.users
for each row execute function public.lifeos_handle_new_user();

insert into public.lifeos_user_state (user_id)
select u.id from auth.users u
on conflict (user_id) do nothing;

-- A profile is private account information. Saved contacts are retrieved by a
-- narrow RPC below instead of granting cross-profile SELECT access.
drop policy if exists "read own and saved call profiles" on public.lifeos_profiles;
drop policy if exists "read own and shared profiles" on public.lifeos_profiles;
drop policy if exists "read own profile" on public.lifeos_profiles;
create policy "read own profile"
on public.lifeos_profiles for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "write own profile" on public.lifeos_profiles;
create policy "write own profile"
on public.lifeos_profiles for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

revoke all on table public.lifeos_profiles from public, anon, authenticated;
grant select on table public.lifeos_profiles to authenticated;
grant update (display_name, time_zone) on table public.lifeos_profiles to authenticated;

-- The old allowlist is retained for backwards compatibility only. It no
-- longer reveals the complete member list to every account.
drop policy if exists "members read members" on public.lifeos_members;
drop policy if exists "read own member record" on public.lifeos_members;
create policy "read own member record"
on public.lifeos_members for select to authenticated
using (user_id = (select auth.uid()));

revoke all on table public.lifeos_members from public, anon, authenticated;
grant select on table public.lifeos_members to authenticated;
grant update (display_name, time_zone) on table public.lifeos_members to authenticated;
revoke all on function public.is_member() from public, anon, authenticated;
revoke all on function public.lifeos_members_guard() from public, anon, authenticated;

create or replace function public.lifeos_list_call_contacts()
returns table (user_id uuid, handle text, display_name text, created_at timestamptz)
language sql stable security definer
set search_path = ''
as $$
  select p.user_id, p.handle, p.display_name, c.created_at
  from public.lifeos_call_contacts c
  join public.lifeos_profiles p on p.user_id = c.contact_user_id
  where c.owner_id = (select auth.uid())
  order by c.created_at desc;
$$;

revoke all on function public.lifeos_list_call_contacts() from public, anon, authenticated;
grant execute on function public.lifeos_list_call_contacts() to authenticated;

-- Trigger/helper functions are not callable API endpoints.
revoke all on function public.lifeos_make_handle(text, uuid) from public, anon, authenticated;
revoke all on function public.lifeos_handle_new_user() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Owner-scope shopping data; bearer links use narrow RPCs only
-- ---------------------------------------------------------------------------

alter table public.suveda_shopping_items
  add column if not exists owner_id uuid references auth.users (id) on delete cascade default auth.uid();
alter table public.suveda_share_tokens
  add column if not exists owner_id uuid references auth.users (id) on delete cascade default auth.uid();

do $$
declare
  legacy_owner uuid;
begin
  select u.id into legacy_owner
  from auth.users u
  where lower(u.email) in ('suvedap@gmail.com', 'suveda@suveda.app')
  order by case when lower(u.email) = 'suvedap@gmail.com' then 0 else 1 end
  limit 1;

  if legacy_owner is not null then
    update public.suveda_shopping_items set owner_id = legacy_owner where owner_id is null;
    update public.suveda_share_tokens set owner_id = legacy_owner where owner_id is null;
  end if;
end;
$$;

create index if not exists suveda_shopping_items_owner_sort_idx
  on public.suveda_shopping_items (owner_id, sort_order);
create index if not exists suveda_share_tokens_owner_created_idx
  on public.suveda_share_tokens (owner_id, created_at desc);

drop policy if exists "public access shopping items" on public.suveda_shopping_items;
drop policy if exists "public read shopping items" on public.suveda_shopping_items;
drop policy if exists "public claim shopping items" on public.suveda_shopping_items;
drop policy if exists "auth manage shopping items" on public.suveda_shopping_items;
drop policy if exists "auth delete shopping items" on public.suveda_shopping_items;
drop policy if exists "owner manages shopping items" on public.suveda_shopping_items;
create policy "owner manages shopping items"
on public.suveda_shopping_items for all to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

drop policy if exists "public access share tokens" on public.suveda_share_tokens;
drop policy if exists "public validate share tokens" on public.suveda_share_tokens;
drop policy if exists "auth manage share tokens" on public.suveda_share_tokens;
drop policy if exists "owner manages share tokens" on public.suveda_share_tokens;
create policy "owner manages share tokens"
on public.suveda_share_tokens for all to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

revoke all on table public.suveda_shopping_items from public, anon, authenticated;
revoke all on table public.suveda_share_tokens from public, anon, authenticated;
grant select, insert, update, delete on table public.suveda_shopping_items to authenticated;
grant select, insert, update, delete on table public.suveda_share_tokens to authenticated;

create or replace function public.lifeos_validate_shopping_share(input_token text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.suveda_share_tokens t
    where t.token = input_token and t.active = true and t.owner_id is not null
  );
$$;

create or replace function public.lifeos_shared_shopping_items(input_token text)
returns table (
  id uuid,
  category text,
  item text,
  quantity text,
  price integer,
  supplied_by text,
  note text,
  sort_order integer,
  created_at timestamptz,
  updated_at timestamptz
)
language sql stable security definer
set search_path = ''
as $$
  select i.id, i.category, i.item, i.quantity, i.price, i.supplied_by,
         i.note, i.sort_order, i.created_at, i.updated_at
  from public.suveda_share_tokens t
  join public.suveda_shopping_items i on i.owner_id = t.owner_id
  where t.token = input_token and t.active = true
  order by i.sort_order, i.created_at;
$$;

create or replace function public.lifeos_claim_shared_shopping_item(
  input_token text,
  input_item_id uuid,
  input_name text
)
returns boolean
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  token_owner uuid;
  changed integer;
  safe_name text := left(btrim(coalesce(input_name, '')), 80);
begin
  select t.owner_id into token_owner
  from public.suveda_share_tokens t
  where t.token = input_token and t.active = true;

  if token_owner is null then
    return false;
  end if;

  update public.suveda_shopping_items i
  set supplied_by = safe_name,
      updated_at = now()
  where i.id = input_item_id and i.owner_id = token_owner;

  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

revoke all on function public.lifeos_validate_shopping_share(text) from public, anon, authenticated;
revoke all on function public.lifeos_shared_shopping_items(text) from public, anon, authenticated;
revoke all on function public.lifeos_claim_shared_shopping_item(text, uuid, text) from public, anon, authenticated;
grant execute on function public.lifeos_validate_shopping_share(text) to anon, authenticated;
grant execute on function public.lifeos_shared_shopping_items(text) to anon, authenticated;
grant execute on function public.lifeos_claim_shared_shopping_item(text, uuid, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Private media storage
-- ---------------------------------------------------------------------------

update storage.buckets set public = false where id = 'memory-photos';

drop policy if exists "Anyone can view memory photos" on storage.objects;
drop policy if exists "Users can view their own photos" on storage.objects;
create policy "Users can view their own photos"
on storage.objects for select to authenticated
using (
  bucket_id = 'memory-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

-- Helpful documentation in the dashboard.
comment on table public.lifeos_user_state is
  'One private application-state row per authenticated Life OS account.';
comment on table public.lifeos_chat_messages is
  'Private AI conversation history, isolated by authenticated user_id.';
