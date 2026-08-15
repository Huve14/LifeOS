-- Production compatibility for projects that adopted the owner-private
-- account model before the earlier space migrations were recorded.
--
-- Community RLS uses membership only as a signed-in Life OS boundary. This
-- migration deliberately does not attach trips, calls, couples or any private
-- account data to a space. It is safe both on the full historical chain (where
-- these objects already exist) and on the current production schema.

create table if not exists public.lifeos_spaces (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.lifeos_space_members (
  space_id uuid not null references public.lifeos_spaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (space_id, user_id)
);

create unique index if not exists lifeos_one_space_per_user
  on public.lifeos_space_members (user_id);

create or replace function public.current_space_id()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select member.space_id
  from public.lifeos_space_members member
  where member.user_id = (select auth.uid())
  limit 1;
$$;

create or replace function public.is_space_member(target uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select target is not null and exists (
    select 1 from public.lifeos_space_members member
    where member.user_id = (select auth.uid()) and member.space_id = target
  );
$$;

create or replace function public.lifeos_shares_space_with(other uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.lifeos_space_members mine
    join public.lifeos_space_members theirs on theirs.space_id = mine.space_id
    where mine.user_id = (select auth.uid()) and theirs.user_id = other
  );
$$;

revoke all on function public.current_space_id() from public, anon;
revoke all on function public.is_space_member(uuid) from public, anon;
revoke all on function public.lifeos_shares_space_with(uuid) from public, anon;
grant execute on function public.current_space_id() to authenticated;
grant execute on function public.is_space_member(uuid) to authenticated;
grant execute on function public.lifeos_shares_space_with(uuid) to authenticated;

alter table public.lifeos_spaces enable row level security;
alter table public.lifeos_space_members enable row level security;

revoke all on table public.lifeos_spaces from public, anon, authenticated;
revoke all on table public.lifeos_space_members from public, anon, authenticated;
grant select, update on table public.lifeos_spaces to authenticated;
grant select on table public.lifeos_space_members to authenticated;

drop policy if exists "read own space" on public.lifeos_spaces;
create policy "read own space" on public.lifeos_spaces
for select to authenticated using (public.is_space_member(id));

drop policy if exists "rename own space" on public.lifeos_spaces;
create policy "rename own space" on public.lifeos_spaces
for update to authenticated using (public.is_space_member(id))
with check (public.is_space_member(id));

drop policy if exists "read own membership" on public.lifeos_space_members;
create policy "read own membership" on public.lifeos_space_members
for select to authenticated using (public.is_space_member(space_id));

do $$
declare
  account record;
  account_space uuid;
begin
  for account in select id from auth.users loop
    if not exists (
      select 1 from public.lifeos_space_members member where member.user_id = account.id
    ) then
      insert into public.lifeos_spaces (created_by)
      values (account.id) returning id into account_space;
      insert into public.lifeos_space_members (space_id, user_id)
      values (account_space, account.id);
    end if;
  end loop;
end;
$$;
