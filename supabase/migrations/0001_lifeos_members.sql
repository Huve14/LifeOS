-- 0001_lifeos_members.sql
--
-- Membership allowlist for the shared LifeOS surfaces (video journal, daily
-- prompt, trip board, calls). Every lifeos_* table hangs its RLS off
-- public.is_member(), so access is limited to the rows seeded here and nothing
-- else. Adding a row is the only way to grant access; there is no client path
-- that can insert one.
--
-- The seed block at the bottom matches accounts by email. If either account
-- signed up through the app's name-only flow, its address will be a synthetic
-- one like name@suveda.app rather than the real inbox. Check with:
--   select id, email from auth.users order by created_at;
-- and adjust the seed before running if the addresses do not match.

create table if not exists public.lifeos_members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  time_zone text not null default 'Africa/Johannesburg',
  created_at timestamptz not null default now()
);

comment on table public.lifeos_members is
  'Allowlist of accounts permitted to read and write the shared lifeos_* tables.';

-- Security definer so the predicate can read the allowlist without the caller
-- needing select rights on it, and so the policies below cannot recurse.
create or replace function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.lifeos_members m where m.user_id = auth.uid()
  );
$$;

revoke all on function public.is_member() from public, anon;
grant execute on function public.is_member() to authenticated;

alter table public.lifeos_members enable row level security;

-- Members can see each other. Needed to render author names and to convert
-- timestamps into the other person's local clock.
drop policy if exists "members read members" on public.lifeos_members;
create policy "members read members"
on public.lifeos_members
for select
to authenticated
using (public.is_member());

-- A member may edit their own display name and time zone, nothing else.
-- There is deliberately no insert or delete policy: the allowlist is seeded by
-- SQL only.
drop policy if exists "member updates own profile" on public.lifeos_members;
create policy "member updates own profile"
on public.lifeos_members
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- Guard against a member escalating by reassigning their row to someone else.
create or replace function public.lifeos_members_guard()
returns trigger
language plpgsql
as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'user_id is immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists lifeos_members_guard on public.lifeos_members;
create trigger lifeos_members_guard
before update on public.lifeos_members
for each row execute function public.lifeos_members_guard();

-- ---------------------------------------------------------------------------
-- Seed. Edit both emails to match the two accounts, then run.
-- Look them up first with:  select id, email from auth.users order by created_at;
--
-- Time zone is set here as a starting point; each person can change their own
-- from inside the app afterwards.
-- ---------------------------------------------------------------------------

insert into public.lifeos_members (user_id, display_name, time_zone)
select
  u.id,
  coalesce(nullif(u.raw_user_meta_data ->> 'name', ''), split_part(u.email, '@', 1)),
  v.time_zone
from (values
  ('huve14@gmail.com',  'Africa/Johannesburg'),
  ('suvedap@gmail.com', 'Asia/Dubai')
) as v (email, time_zone)
join auth.users u on lower(u.email) = lower(v.email)
on conflict (user_id) do nothing;

-- Verify: this should return exactly two rows.
-- select display_name, time_zone from public.lifeos_members;
