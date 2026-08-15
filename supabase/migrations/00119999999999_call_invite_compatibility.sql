-- 0009 retires the lifeos_members allowlist, while 0012 and the first part of
-- 20260814163629 still consult it during one-time account backfills. Restore a
-- short-lived compatibility table and its two helper functions. The table is
-- removed immediately after the private-account migration.

do $$
begin
  if to_regclass('public.lifeos_members') is null then
    create table public.lifeos_members (
      user_id uuid primary key references auth.users(id) on delete cascade,
      display_name text not null,
      time_zone text not null default 'UTC',
      created_at timestamptz not null default now()
    );

    insert into public.lifeos_members (user_id, display_name, time_zone, created_at)
    select user_id, display_name, time_zone, created_at
    from public.lifeos_profiles
    on conflict (user_id) do nothing;
  end if;
end;
$$;

create or replace function public.is_member()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.lifeos_members member
    where member.user_id = (select auth.uid())
  );
$$;

create or replace function public.lifeos_members_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'user_id is immutable';
  end if;
  return new;
end;
$$;
