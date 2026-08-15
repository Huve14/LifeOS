-- Reconcile the obsolete space-scoped Trip schema with the owner-private
-- Trip board introduced by 20260814230211_complete_trip_board.sql.
--
-- Production already has the owner-private schema, so this migration is a
-- guarded no-op there. On an empty database the older 0006/0009 migrations
-- have created a space_id model; move those tables out of public before the
-- newer migration runs. The companion 20260814230240 migration copies the
-- data into the final owner-private shape and removes the quarantine schema.

create schema if not exists lifeos_trip_legacy;
revoke all on schema lifeos_trip_legacy from public, anon, authenticated;

do $$
declare
  has_owner_id boolean;
  has_space_id boolean;
begin
  if to_regclass('public.lifeos_trips') is null then
    return;
  end if;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'lifeos_trips' and column_name = 'owner_id'
  ) into has_owner_id;
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'lifeos_trips' and column_name = 'space_id'
  ) into has_space_id;

  if has_owner_id and not has_space_id then
    -- The final schema is already installed (the production case).
    return;
  end if;

  if not has_owner_id and has_space_id
     and to_regclass('public.lifeos_trip_items') is not null then
    alter table public.lifeos_trip_items set schema lifeos_trip_legacy;
    alter table public.lifeos_trips set schema lifeos_trip_legacy;
    return;
  end if;

  raise exception 'Unknown lifeos_trips schema; refusing an automatic replacement';
end;
$$;
