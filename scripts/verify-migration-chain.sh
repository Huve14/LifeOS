#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "$0")/.." && pwd)"
cluster_dir="$(mktemp -d "${TMPDIR:-/tmp}/lifeos-migrations.XXXXXX")"
port=55439

cleanup() {
  if [[ -f "$cluster_dir/data/postmaster.pid" ]]; then
    pg_ctl -D "$cluster_dir/data" -m fast stop >/dev/null
  fi
  rm -rf "$cluster_dir"
}
trap cleanup EXIT

initdb -D "$cluster_dir/data" --auth=trust --no-locale >/dev/null
pg_ctl -D "$cluster_dir/data" -o "-p $port" -l "$cluster_dir/postgres.log" start >/dev/null
createdb -p "$port" lifeos_migration_test

psql -X -v ON_ERROR_STOP=1 -p "$port" -d lifeos_migration_test \
  -f "$repo_dir/supabase/tests/local_bootstrap.sql" >/dev/null

while IFS= read -r migration; do
  printf 'Applying %s\n' "$(basename "$migration")"
  psql -X -v ON_ERROR_STOP=1 -p "$port" -d lifeos_migration_test -f "$migration" >/dev/null
done < <(
  find "$repo_dir/supabase/migrations" -maxdepth 1 -name '*.sql' -print \
    | awk -F/ '{ file=$NF; split(file, parts, "_"); print parts[1] " " $0 }' \
    | LC_ALL=C sort -k1,1 \
    | cut -d' ' -f2-
)

psql -X -v ON_ERROR_STOP=1 -p "$port" -d lifeos_migration_test <<'SQL'
select column_name
from information_schema.columns
where table_schema = 'public' and table_name = 'lifeos_trips'
order by ordinal_position;

do $$
begin
  if to_regclass('public.lifeos_trips') is null
     or to_regclass('public.lifeos_trip_items') is null then
    raise exception 'Final Trip tables are missing';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'lifeos_trips' and column_name = 'owner_id'
  ) or exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'lifeos_trips' and column_name = 'space_id'
  ) then
    raise exception 'Trip schema did not reconcile to the owner-private model';
  end if;
  if to_regnamespace('lifeos_trip_legacy') is not null then
    raise exception 'Trip quarantine schema was not cleaned up';
  end if;
end;
$$;
SQL

printf 'Migration chain verified successfully.\n'
