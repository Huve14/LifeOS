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
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'priya.one@example.com', '{"name":"Priya"}'::jsonb),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'priya.two@example.com', '{"name":"Priya"}'::jsonb);

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

update public.lifeos_profiles
set status = 'just_landed', arrived_on = current_date
where user_id = auth.uid();

do $$
begin
  if (select count(*) from public.lifeos_arrival_tasks where owner_id = auth.uid()) <> 3 then
    raise exception 'Arrival automation did not generate three private tasks';
  end if;
  if not exists (
    select 1 from public.lifeos_welcome_drafts
    where owner_id = auth.uid() and published_at is not null and published_question_id is not null
  ) then
    raise exception 'Just-landed profile did not automatically publish its generic welcome';
  end if;
end;
$$;

-- Publishing again must be idempotent and return the existing question.
select public.lifeos_publish_welcome_intro();

select set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', false);

do $$
begin
  if not exists (
    select 1 from public.lifeos_price_points
    where price = 12.99 and source = 'community' and submitted_name = 'Priya'
  ) then
    raise exception 'Account B cannot read Account A community price with decimal/source/author';
  end if;
  if not exists (
    select 1 from public.lifeos_profiles
    where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and display_name = 'Priya'
  ) then
    raise exception 'Second same-name account did not retain its own profile';
  end if;
  if exists (select 1 from public.lifeos_price_watches) then
    raise exception 'Account B can read Account A private price watch';
  end if;
  if exists (
    select 1 from public.lifeos_arrival_tasks
    where owner_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  ) then
    raise exception 'Account B can read Account A private arrival tasks';
  end if;
  if exists (
    select 1 from public.lifeos_automation_preferences
    where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  ) then
    raise exception 'Account B can read Account A private automation preferences';
  end if;
  if exists (
    select 1 from public.lifeos_welcome_drafts
    where owner_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  ) then
    raise exception 'Account B can read Account A private welcome draft';
  end if;
  if not exists (
    select 1 from public.lifeos_questions
    where title = 'Hello from a new South African in Abu Dhabi'
  ) then
    raise exception 'Automatic welcome did not enter the community feed';
  end if;
  if not exists (select 1 from public.lifeos_toolkit_items)
     or not exists (select 1 from public.lifeos_sa_calendar) then
    raise exception 'Authenticated member cannot read shared toolkit/calendar reference data';
  end if;
end;
$$;

-- Phase 2 security contract: community rows cross account boundaries, private
-- state and non-opted-in profiles do not, and three distinct reports hide a
-- row from everyone except its author.
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false);

insert into public.lifeos_questions (id, author_id, title, body)
values (
  '11111111-1111-4111-8111-111111111111',
  auth.uid(),
  'Where can I find rooibos?',
  'Looking near Khalifa City.'
);

select set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', false);

do $$
begin
  if not exists (
    select 1 from public.lifeos_questions where id = '11111111-1111-4111-8111-111111111111'
  ) then
    raise exception 'Account B cannot read Account A community question';
  end if;
  if exists (
    select 1 from public.lifeos_user_state where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  ) then
    raise exception 'Account B can read Account A private state';
  end if;
  if exists (
    select 1 from public.lifeos_profiles where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  ) then
    raise exception 'Account A appears in directory without opting in';
  end if;
end;
$$;

reset role;
insert into auth.users (id, email, raw_user_meta_data) values
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'c@example.com', '{"name":"Account C"}'::jsonb),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'd@example.com', '{"name":"Account D"}'::jsonb);

set role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', false);
insert into public.lifeos_reports (target_table, target_id, reason, reporter_id)
values ('questions', '11111111-1111-4111-8111-111111111111', 'Needs review', auth.uid());

select set_config('request.jwt.claim.sub', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', false);
insert into public.lifeos_reports (target_table, target_id, reason, reporter_id)
values ('questions', '11111111-1111-4111-8111-111111111111', 'Needs review', auth.uid());

select set_config('request.jwt.claim.sub', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', false);
insert into public.lifeos_reports (target_table, target_id, reason, reporter_id)
values ('questions', '11111111-1111-4111-8111-111111111111', 'Needs review', auth.uid());

do $$
begin
  if exists (
    select 1 from public.lifeos_questions where id = '11111111-1111-4111-8111-111111111111'
  ) then
    raise exception 'Three reports did not hide the community row';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false);
do $$
begin
  if not exists (
    select 1 from public.lifeos_questions
    where id = '11111111-1111-4111-8111-111111111111' and hidden = true
  ) then
    raise exception 'Hidden row is not visible to its author';
  end if;
end;
$$;

update public.lifeos_profiles set visible_in_directory = true
where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

select set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', false);
do $$
begin
  if not exists (
    select 1 from public.lifeos_profiles where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  ) then
    raise exception 'Opted-in Account A does not appear in Account B directory';
  end if;
end;
$$;

-- Closeness security contract: a couple's thoughts and dates are theirs, the
-- rate limit is enforced by the database rather than the client, and a thought
-- queues a push whose body is composed server-side from the gesture alone.
reset role;
insert into public.lifeos_couples (id, name, created_by)
overriding system value
values (9001, 'Our space', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc');
insert into public.lifeos_couple_members (couple_id, user_id) values
  (9001, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
  (9001, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd');

set role authenticated;
select set_config('request.jwt.claim.sub', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', false);

insert into public.lifeos_couple_thoughts (couple_id, sender_id, gesture)
values (9001, auth.uid(), 'heart');

insert into public.lifeos_couple_dates (couple_id, created_by, kind, label, happens_on, repeats_annually)
values (9001, auth.uid(), 'reunion', 'Together in Abu Dhabi', current_date + 12, false);

do $$
begin
  -- The throttle has to hold against a client that simply does not wait.
  begin
    insert into public.lifeos_couple_thoughts (couple_id, sender_id, gesture)
    values (9001, auth.uid(), 'hug');
    raise exception 'A second thought inside the cooldown was accepted';
  exception
    when sqlstate '53400' then null;
  end;
end;
$$;

-- The notification queue is deny-all to clients by design, so these are
-- checked from outside the authenticated role.
reset role;
do $$
begin
  if not exists (
    select 1 from public.lifeos_notifications
    where recipient_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
      and body like '%is thinking of you.%'
  ) then
    raise exception 'Sending a thought did not queue a push for the partner';
  end if;

  if exists (
    select 1 from public.lifeos_notifications
    where recipient_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
      and data ->> 'gesture' is not null
  ) then
    raise exception 'A sender was notified of their own thought';
  end if;
end;
$$;

set role authenticated;

select set_config('request.jwt.claim.sub', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', false);
do $$
begin
  if not exists (select 1 from public.lifeos_couple_thoughts where couple_id = 9001) then
    raise exception 'A partner cannot read a thought sent to them';
  end if;
  if not exists (select 1 from public.lifeos_couple_dates where couple_id = 9001) then
    raise exception 'A partner cannot read a shared date';
  end if;

  -- Either of them may correct a shared date; only the recipient marks seen.
  update public.lifeos_couple_dates set label = 'Together in Abu Dhabi (confirmed)'
  where couple_id = 9001;
  if not exists (
    select 1 from public.lifeos_couple_dates
    where couple_id = 9001 and label = 'Together in Abu Dhabi (confirmed)'
  ) then
    raise exception 'A partner cannot correct a shared date';
  end if;

  update public.lifeos_couple_thoughts set seen_at = now() where couple_id = 9001;
  if exists (select 1 from public.lifeos_couple_thoughts where couple_id = 9001 and seen_at is null) then
    raise exception 'A recipient cannot mark a received thought seen';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false);
do $$
begin
  if exists (select 1 from public.lifeos_couple_thoughts) then
    raise exception 'An outsider can read another couple''s thoughts';
  end if;
  if exists (select 1 from public.lifeos_couple_dates) then
    raise exception 'An outsider can read another couple''s dates';
  end if;
end;
$$;

reset role;

-- Shop & Save ingestion contract: retailer sources are insertable, unknown
-- sources are rejected, re-running an ingest cannot duplicate a special, and
-- members can read feed health but never write it.
do $$
declare
  product_id uuid;
  store_id uuid;
begin
  if not exists (
    select 1 from public.lifeos_price_sources
    where slug = 'carrefour' and kind = 'retailer' and 'Dubai' = any (emirates)
  ) then
    raise exception 'Carrefour is not registered as a Dubai retailer source';
  end if;
  if not exists (select 1 from public.lifeos_price_sources where slug = 'clicflyer' and kind = 'aggregator') then
    raise exception 'ClicFlyer aggregator source is missing';
  end if;

  select id into product_id from public.lifeos_products where name = 'Biltong' limit 1;
  insert into public.lifeos_stores (name, area, emirate)
  values ('Carrefour', 'Mall of the Emirates', 'Dubai')
  returning id into store_id;

  -- A retailer-sourced deal must now be accepted; before the registry the
  -- four-value CHECK made this impossible.
  insert into public.lifeos_deals (
    product_id, store_id, title, current_price, original_price, currency, source, source_reference
  ) values (product_id, store_id, 'Biltong special', 19.95, 27.50, 'AED', 'carrefour', 'carrefour:deal:1');

  -- Re-running the same ingest must not duplicate it.
  begin
    insert into public.lifeos_deals (
      product_id, store_id, title, current_price, original_price, currency, source, source_reference
    ) values (product_id, store_id, 'Biltong special', 19.95, 27.50, 'AED', 'carrefour', 'carrefour:deal:1');
    raise exception 'Duplicate source_reference was accepted; scheduled ingest would duplicate deals';
  exception when unique_violation then
    null;
  end;

  -- An unregistered source must be refused.
  begin
    insert into public.lifeos_deals (
      product_id, store_id, title, current_price, currency, source
    ) values (product_id, store_id, 'Bogus', 1.00, 'AED', 'not-a-real-source');
    raise exception 'Unregistered price source was accepted';
  exception when foreign_key_violation then
    null;
  end;

  if not exists (
    select 1 from public.lifeos_stores where name = 'Carrefour' and emirate = 'Dubai'
  ) then
    raise exception 'Dubai store was not stored against the Dubai emirate';
  end if;
end;
$$;

set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false);
do $$
begin
  if not exists (select 1 from public.lifeos_price_sources where slug = 'lulu') then
    raise exception 'Member cannot read price source health';
  end if;
  if not exists (
    select 1 from public.lifeos_deals where source = 'carrefour' and current_price = 19.95
  ) then
    raise exception 'Member cannot read an ingested retailer special';
  end if;
  begin
    update public.lifeos_price_sources set enabled = false where slug = 'lulu';
    raise exception 'Member was able to write price source health';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

reset role;
SQL

printf 'Migration chain verified successfully.\n'
