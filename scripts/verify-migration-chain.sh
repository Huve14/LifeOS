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

-- Phase 1 security contract: community prices are shared, personal watches
-- are not, decimals survive, and attribution is derived from the auth user.
insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a@example.com', '{"name":"Account A"}'::jsonb),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'b@example.com', '{"name":"Account B"}'::jsonb);

set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false);

insert into public.lifeos_price_points (
  product_id, store_id, price, currency, source, seen_at, submitted_by
)
select product.id, store.id, 12.99, 'AED', 'community', now(), auth.uid()
from public.lifeos_products product
cross join public.lifeos_stores store
where product.name = 'Biltong' and store.name = 'Spinneys'
limit 1;

insert into public.lifeos_price_watches (owner_id, product_id, target_price)
select auth.uid(), product.id, 10.50
from public.lifeos_products product
where product.name = 'Biltong'
limit 1;

select set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', false);

do $$
begin
  if not exists (
    select 1 from public.lifeos_price_points
    where price = 12.99 and source = 'community' and submitted_name = 'Account A'
  ) then
    raise exception 'Account B cannot read Account A community price with decimal/source/author';
  end if;
  if exists (select 1 from public.lifeos_price_watches) then
    raise exception 'Account B can read Account A private price watch';
  end if;
end;
$$;

reset role;
SQL

printf 'Migration chain verified successfully.\n'
