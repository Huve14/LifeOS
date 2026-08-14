-- 0012_lifeos_call_invites.sql
--
-- Browser-call invitations and discoverable (but not enumerable) LifeOS
-- handles. A call link is a bearer credential: the raw 256-bit token appears
-- only in the URL, while the database stores its SHA-256 digest.

-- ---------------------------------------------------------------------------
-- Profiles and stable handles
-- ---------------------------------------------------------------------------

create table if not exists public.lifeos_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  time_zone text not null default 'UTC',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.lifeos_profiles add column if not exists handle text;

create or replace function public.lifeos_make_handle(input_name text, input_user_id uuid)
returns text
language sql immutable
set search_path = ''
as $$
  select left(
    coalesce(
      nullif(trim(both '_' from regexp_replace(lower(coalesce(input_name, '')), '[^a-z0-9]+', '_', 'g')), ''),
      'member'
    ),
    12
  ) || '_' || left(replace(input_user_id::text, '-', ''), 10);
$$;

update public.lifeos_profiles
set handle = public.lifeos_make_handle(display_name, user_id)
where handle is null or handle = '';

alter table public.lifeos_profiles alter column handle set not null;

create unique index if not exists lifeos_profiles_handle_key
  on public.lifeos_profiles (handle);

alter table public.lifeos_profiles drop constraint if exists lifeos_profiles_handle_format;
alter table public.lifeos_profiles
  add constraint lifeos_profiles_handle_format
  check (handle ~ '^[a-z0-9][a-z0-9_]{2,23}$');

-- Keep the trigger compatible with both the current lightweight production
-- schema and the full spaces schema in migration 0009. Dynamic SQL avoids a
-- hard dependency on tables that may not have been installed yet.
create or replace function public.lifeos_handle_new_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  new_space uuid;
  existing_space uuid;
  new_name text;
begin
  new_name := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
    split_part(coalesce(new.email, ''), '@', 1),
    'Member'
  );

  insert into public.lifeos_profiles (user_id, display_name, handle)
  values (new.id, new_name, public.lifeos_make_handle(new_name, new.id))
  on conflict (user_id) do nothing;

  if to_regclass('public.lifeos_spaces') is not null
     and to_regclass('public.lifeos_space_members') is not null then
    execute 'select space_id from public.lifeos_space_members where user_id = $1 limit 1'
      into existing_space using new.id;

    if existing_space is null then
      execute 'insert into public.lifeos_spaces (created_by) values ($1) returning id'
        into new_space using new.id;
      execute 'insert into public.lifeos_space_members (space_id, user_id) values ($1, $2) on conflict do nothing'
        using new_space, new.id;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists lifeos_on_auth_user_created on auth.users;
create trigger lifeos_on_auth_user_created
after insert on auth.users
for each row execute function public.lifeos_handle_new_user();

-- Backfill accounts created before this trigger. Prefer the existing member
-- display name because it is the name already shown inside the app.
insert into public.lifeos_profiles (user_id, display_name, time_zone, handle)
select
  u.id,
  coalesce(m.display_name, nullif(u.raw_user_meta_data ->> 'name', ''), split_part(u.email, '@', 1), 'Member'),
  coalesce(m.time_zone, 'UTC'),
  public.lifeos_make_handle(
    coalesce(m.display_name, nullif(u.raw_user_meta_data ->> 'name', ''), split_part(u.email, '@', 1), 'Member'),
    u.id
  )
from auth.users u
left join public.lifeos_members m on m.user_id = u.id
on conflict (user_id) do update
set display_name = case
      when public.lifeos_profiles.display_name = '' then excluded.display_name
      else public.lifeos_profiles.display_name
    end,
    handle = coalesce(nullif(public.lifeos_profiles.handle, ''), excluded.handle);

-- ---------------------------------------------------------------------------
-- Saved call contacts
-- ---------------------------------------------------------------------------

create table if not exists public.lifeos_call_contacts (
  owner_id uuid not null references public.lifeos_profiles (user_id) on delete cascade,
  contact_user_id uuid not null references public.lifeos_profiles (user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner_id, contact_user_id),
  constraint lifeos_call_contacts_not_self check (owner_id <> contact_user_id)
);

create index if not exists lifeos_call_contacts_contact_idx
  on public.lifeos_call_contacts (contact_user_id, owner_id);

-- ---------------------------------------------------------------------------
-- Expiring browser invitations
-- ---------------------------------------------------------------------------

create table if not exists public.lifeos_call_invites (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.lifeos_profiles (user_id) on delete cascade,
  target_user_id uuid references public.lifeos_profiles (user_id) on delete set null,
  room_name text not null unique,
  token_hash text not null unique,
  mode text not null default 'audio' check (mode in ('audio', 'video')),
  expires_at timestamptz not null default now() + interval '24 hours',
  max_uses smallint not null default 32 check (max_uses between 1 and 64),
  uses smallint not null default 0 check (uses >= 0),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists lifeos_call_invites_creator_idx
  on public.lifeos_call_invites (created_by, created_at desc);
create index if not exists lifeos_call_invites_target_idx
  on public.lifeos_call_invites (target_user_id, created_at desc)
  where target_user_id is not null;

-- ---------------------------------------------------------------------------
-- RLS and least-privilege table grants
-- ---------------------------------------------------------------------------

alter table public.lifeos_profiles enable row level security;
alter table public.lifeos_call_contacts enable row level security;
alter table public.lifeos_call_invites enable row level security;

drop policy if exists "read own and saved call profiles" on public.lifeos_profiles;
create policy "read own and saved call profiles"
on public.lifeos_profiles for select to authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1 from public.lifeos_call_contacts c
    where c.owner_id = (select auth.uid())
      and c.contact_user_id = lifeos_profiles.user_id
  )
);

-- Retain migration 0009's policy name when present, but narrow it to the same
-- owner/contact rule when the spaces helpers do not exist.
drop policy if exists "read own and shared profiles" on public.lifeos_profiles;

drop policy if exists "write own profile" on public.lifeos_profiles;
create policy "write own profile"
on public.lifeos_profiles for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists "insert own profile" on public.lifeos_profiles;

drop policy if exists "read own call contacts" on public.lifeos_call_contacts;
create policy "read own call contacts"
on public.lifeos_call_contacts for select to authenticated
using (owner_id = (select auth.uid()));

drop policy if exists "delete own call contacts" on public.lifeos_call_contacts;
create policy "delete own call contacts"
on public.lifeos_call_contacts for delete to authenticated
using (owner_id = (select auth.uid()));

drop policy if exists "read created call invites" on public.lifeos_call_invites;
create policy "read created call invites"
on public.lifeos_call_invites for select to authenticated
using (created_by = (select auth.uid()));

revoke all on table public.lifeos_profiles from public, anon, authenticated;
revoke all on table public.lifeos_call_contacts from public, anon, authenticated;
revoke all on table public.lifeos_call_invites from public, anon, authenticated;
grant select on table public.lifeos_profiles to authenticated;
grant update (display_name, time_zone) on table public.lifeos_profiles to authenticated;
grant select, delete on table public.lifeos_call_contacts to authenticated;
grant select on table public.lifeos_call_invites to authenticated;

-- ---------------------------------------------------------------------------
-- Narrow RPC surface
-- ---------------------------------------------------------------------------

create or replace function public.lifeos_add_contact_by_handle(input_handle text)
returns table (user_id uuid, handle text, display_name text)
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  found public.lifeos_profiles;
begin
  if me is null then
    raise exception 'Not signed in';
  end if;

  select p.* into found
  from public.lifeos_profiles p
  where p.handle = lower(btrim(input_handle));

  if found.user_id is null or found.user_id = me then
    raise exception 'No other LifeOS user has that ID';
  end if;

  insert into public.lifeos_call_contacts (owner_id, contact_user_id)
  values (me, found.user_id)
  on conflict do nothing;

  return query select found.user_id, found.handle, found.display_name;
end;
$$;

create or replace function public.lifeos_create_call_invite(
  input_mode text default 'audio',
  input_target_handle text default null
)
returns table (
  invite_id uuid,
  invite_token text,
  invite_mode text,
  invite_expires_at timestamptz,
  target_display_name text
)
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  raw_token text;
  selected_mode text;
  target_profile public.lifeos_profiles;
  created public.lifeos_call_invites;
begin
  if me is null then
    raise exception 'Not signed in';
  end if;

  selected_mode := lower(coalesce(input_mode, 'audio'));
  if selected_mode not in ('audio', 'video') then
    raise exception 'Call mode must be audio or video';
  end if;

  if nullif(btrim(coalesce(input_target_handle, '')), '') is not null then
    select p.* into target_profile
    from public.lifeos_profiles p
    where p.handle = lower(btrim(input_target_handle));

    if target_profile.user_id is null or target_profile.user_id = me then
      raise exception 'That LifeOS user was not found';
    end if;
  end if;

  raw_token := encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.lifeos_call_invites (
    created_by,
    target_user_id,
    room_name,
    token_hash,
    mode
  ) values (
    me,
    target_profile.user_id,
    'lifeos-invite-' || gen_random_uuid()::text,
    encode(extensions.digest(convert_to(raw_token, 'UTF8'), 'sha256'), 'hex'),
    selected_mode
  ) returning * into created;

  return query
  select
    created.id,
    raw_token,
    created.mode,
    created.expires_at,
    target_profile.display_name;
end;
$$;

-- The raw token is the guest's authorization. This function is intentionally
-- callable by anon, returns only call-safe metadata, locks the row while
-- redeeming, and never exposes the stored digest or creator identity.
create or replace function public.lifeos_redeem_call_invite(input_token text)
returns table (
  invite_room text,
  invite_mode text,
  creator_name text,
  invite_expires_at timestamptz
)
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  selected public.lifeos_call_invites;
  owner_name text;
  normalized_token text := lower(btrim(coalesce(input_token, '')));
begin
  if normalized_token !~ '^[0-9a-f]{64}$' then
    return;
  end if;

  select i.* into selected
  from public.lifeos_call_invites i
  where i.token_hash = encode(
    extensions.digest(convert_to(normalized_token, 'UTF8'), 'sha256'),
    'hex'
  )
  for update;

  if selected.id is null
     or selected.revoked_at is not null
     or selected.expires_at <= now()
     or selected.uses >= selected.max_uses then
    return;
  end if;

  update public.lifeos_call_invites
  set uses = uses + 1
  where id = selected.id;

  select p.display_name into owner_name
  from public.lifeos_profiles p
  where p.user_id = selected.created_by;

  return query
  select selected.room_name, selected.mode, coalesce(owner_name, 'LifeOS'), selected.expires_at;
end;
$$;

create or replace function public.lifeos_revoke_call_invite(input_invite_id uuid)
returns boolean
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  changed integer;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  update public.lifeos_call_invites
  set revoked_at = now()
  where id = input_invite_id
    and created_by = auth.uid()
    and revoked_at is null;

  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

revoke all on function public.lifeos_make_handle(text, uuid) from public, anon, authenticated;
revoke all on function public.lifeos_handle_new_user() from public, anon, authenticated;
revoke all on function public.lifeos_add_contact_by_handle(text) from public, anon, authenticated;
revoke all on function public.lifeos_create_call_invite(text, text) from public, anon, authenticated;
revoke all on function public.lifeos_redeem_call_invite(text) from public, anon, authenticated;
revoke all on function public.lifeos_revoke_call_invite(uuid) from public, anon, authenticated;

grant execute on function public.lifeos_add_contact_by_handle(text) to authenticated;
grant execute on function public.lifeos_create_call_invite(text, text) to authenticated;
grant execute on function public.lifeos_redeem_call_invite(text) to anon, authenticated;
grant execute on function public.lifeos_revoke_call_invite(uuid) to authenticated;
