-- 0014_community.sql
--
-- Opt-in South African expat community for Abu Dhabi. Community content is
-- readable by signed-in Life OS members; private account and space tables are
-- deliberately untouched. Reports hide content for review, never delete it.

alter table public.lifeos_profiles
  add column if not exists home_town text,
  add column if not exists emirate text,
  add column if not exists arrived_on date,
  add column if not exists status text,
  add column if not exists interests text[] not null default '{}'::text[],
  add column if not exists visible_in_directory boolean not null default false,
  add column if not exists employer_name text;

alter table public.lifeos_profiles
  drop constraint if exists lifeos_profiles_status_check;
alter table public.lifeos_profiles
  add constraint lifeos_profiles_status_check
  check (status is null or status in ('landing_soon', 'just_landed', 'settled'));

create index if not exists lifeos_profiles_directory_idx
  on public.lifeos_profiles (emirate, status, display_name)
  where visible_in_directory = true;

create table if not exists public.lifeos_community_places (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  category text not null default 'community',
  description text not null default '' check (char_length(description) <= 1200),
  area text not null default '',
  emirate text not null default 'Abu Dhabi',
  address text not null default '',
  longitude numeric(10,7),
  latitude numeric(10,7),
  status text not null default 'pending' check (status in ('pending', 'approved')),
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lifeos_community_events (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 180),
  description text not null default '' check (char_length(description) <= 2400),
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text not null default '',
  area text not null default '',
  capacity integer check (capacity is null or capacity > 0),
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or ends_at >= starts_at)
);

create table if not exists public.lifeos_event_rsvps (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.lifeos_community_events (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  response text not null default 'going' check (response in ('going', 'interested')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, user_id)
);

create table if not exists public.lifeos_questions (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 220),
  body text not null default '' check (char_length(body) <= 4000),
  resolved_answer_id uuid,
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lifeos_answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.lifeos_questions (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  parent_answer_id uuid references public.lifeos_answers (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  accepted boolean not null default false,
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.lifeos_questions
  drop constraint if exists lifeos_questions_resolved_answer_id_fkey;
alter table public.lifeos_questions
  add constraint lifeos_questions_resolved_answer_id_fkey
  foreign key (resolved_answer_id) references public.lifeos_answers (id) on delete set null;

create table if not exists public.lifeos_classifieds (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 180),
  description text not null default '' check (char_length(description) <= 2400),
  category text not null default 'Furniture',
  price numeric(12,2) not null check (price >= 0),
  currency text not null default 'AED' check (currency = 'AED'),
  area text not null default '',
  photo_path text,
  sold_at timestamptz,
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lifeos_polls (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users (id) on delete cascade,
  question text not null check (char_length(btrim(question)) between 1 and 220),
  ends_at timestamptz,
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lifeos_poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.lifeos_polls (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  label text not null check (char_length(btrim(label)) between 1 and 120),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (id, poll_id)
);

create table if not exists public.lifeos_poll_votes (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.lifeos_polls (id) on delete cascade,
  option_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (poll_id, user_id),
  foreign key (option_id, poll_id)
    references public.lifeos_poll_options (id, poll_id) on delete cascade
);

create table if not exists public.lifeos_reports (
  id uuid primary key default gen_random_uuid(),
  target_table text not null check (target_table in ('places', 'events', 'questions', 'answers', 'classifieds', 'polls')),
  target_id uuid not null,
  reason text not null check (char_length(btrim(reason)) between 3 and 500),
  reporter_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (reporter_id, target_table, target_id)
);

create index if not exists lifeos_community_places_created_idx on public.lifeos_community_places (created_at desc);
create index if not exists lifeos_community_places_map_idx on public.lifeos_community_places (status, emirate, area);
create index if not exists lifeos_community_places_author_idx on public.lifeos_community_places (author_id);
create index if not exists lifeos_community_events_starts_idx on public.lifeos_community_events (starts_at);
create index if not exists lifeos_community_events_author_idx on public.lifeos_community_events (author_id);
create index if not exists lifeos_event_rsvps_event_idx on public.lifeos_event_rsvps (event_id, created_at);
create index if not exists lifeos_event_rsvps_user_idx on public.lifeos_event_rsvps (user_id);
create index if not exists lifeos_questions_created_idx on public.lifeos_questions (created_at desc);
create index if not exists lifeos_questions_author_idx on public.lifeos_questions (author_id);
create index if not exists lifeos_answers_question_idx on public.lifeos_answers (question_id, created_at);
create index if not exists lifeos_answers_author_idx on public.lifeos_answers (author_id);
create index if not exists lifeos_classifieds_feed_idx on public.lifeos_classifieds (sold_at, created_at desc);
create index if not exists lifeos_classifieds_author_idx on public.lifeos_classifieds (author_id);
create index if not exists lifeos_polls_created_idx on public.lifeos_polls (created_at desc);
create index if not exists lifeos_poll_options_poll_idx on public.lifeos_poll_options (poll_id, sort_order);
create index if not exists lifeos_poll_votes_option_idx on public.lifeos_poll_votes (option_id);
create index if not exists lifeos_reports_target_idx on public.lifeos_reports (target_table, target_id);

create or replace function public.lifeos_is_moderator()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'moderator', false);
$$;

create or replace function public.lifeos_community_member_count()
returns integer
language sql stable security definer set search_path = ''
as $$
  select case
    when (select public.current_space_id()) is null then 0
    else (select count(*)::integer from public.lifeos_profiles)
  end;
$$;

create or replace function public.lifeos_is_community_target_author(target_table text, target_id uuid)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
begin
  case target_table
    when 'places' then return exists (select 1 from public.lifeos_community_places where id = target_id and author_id = (select auth.uid()));
    when 'events' then return exists (select 1 from public.lifeos_community_events where id = target_id and author_id = (select auth.uid()));
    when 'questions' then return exists (select 1 from public.lifeos_questions where id = target_id and author_id = (select auth.uid()));
    when 'answers' then return exists (select 1 from public.lifeos_answers where id = target_id and author_id = (select auth.uid()));
    when 'classifieds' then return exists (select 1 from public.lifeos_classifieds where id = target_id and author_id = (select auth.uid()));
    when 'polls' then return exists (select 1 from public.lifeos_polls where id = target_id and author_id = (select auth.uid()));
    else return false;
  end case;
end;
$$;

create or replace function public.lifeos_guard_community_hidden()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.hidden is distinct from old.hidden
     and coalesce(current_setting('lifeos.moderation_change', true), '') <> 'on'
     and not public.lifeos_is_moderator() then
    raise exception 'Only moderators can change moderation state';
  end if;
  return new;
end;
$$;

create or replace function public.lifeos_apply_community_report()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  report_count integer;
begin
  select count(*) into report_count
  from public.lifeos_reports report
  where report.target_table = new.target_table and report.target_id = new.target_id;

  if report_count >= 3 then
    perform set_config('lifeos.moderation_change', 'on', true);
    case new.target_table
      when 'places' then update public.lifeos_community_places set hidden = true where id = new.target_id;
      when 'events' then update public.lifeos_community_events set hidden = true where id = new.target_id;
      when 'questions' then update public.lifeos_questions set hidden = true where id = new.target_id;
      when 'answers' then update public.lifeos_answers set hidden = true where id = new.target_id;
      when 'classifieds' then update public.lifeos_classifieds set hidden = true where id = new.target_id;
      when 'polls' then update public.lifeos_polls set hidden = true where id = new.target_id;
      else null;
    end case;
  end if;
  return new;
end;
$$;

create or replace function public.lifeos_accept_community_answer(input_question_id uuid, input_answer_id uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.lifeos_questions
    where id = input_question_id and author_id = (select auth.uid())
  ) or not exists (
    select 1 from public.lifeos_answers
    where id = input_answer_id and question_id = input_question_id
  ) then
    return false;
  end if;

  update public.lifeos_answers set accepted = false where question_id = input_question_id;
  update public.lifeos_answers set accepted = true where id = input_answer_id;
  update public.lifeos_questions set resolved_answer_id = input_answer_id where id = input_question_id;
  return true;
end;
$$;

revoke all on function public.lifeos_is_moderator() from public, anon;
revoke all on function public.lifeos_community_member_count() from public, anon;
revoke all on function public.lifeos_is_community_target_author(text, uuid) from public, anon;
revoke all on function public.lifeos_guard_community_hidden() from public, anon, authenticated;
revoke all on function public.lifeos_apply_community_report() from public, anon, authenticated;
revoke all on function public.lifeos_accept_community_answer(uuid, uuid) from public, anon;
grant execute on function public.lifeos_is_moderator() to authenticated;
grant execute on function public.lifeos_community_member_count() to authenticated;
grant execute on function public.lifeos_is_community_target_author(text, uuid) to authenticated;
grant execute on function public.lifeos_accept_community_answer(uuid, uuid) to authenticated;

do $$
declare target_table text;
begin
  foreach target_table in array array[
    'lifeos_community_places', 'lifeos_community_events', 'lifeos_questions',
    'lifeos_answers', 'lifeos_classifieds', 'lifeos_polls'
  ] loop
    execute format('drop trigger if exists lifeos_guard_hidden on public.%I', target_table);
    execute format(
      'create trigger lifeos_guard_hidden before update on public.%I for each row execute function public.lifeos_guard_community_hidden()',
      target_table
    );
  end loop;
end;
$$;

drop trigger if exists lifeos_reports_apply_moderation on public.lifeos_reports;
create trigger lifeos_reports_apply_moderation after insert on public.lifeos_reports
for each row execute function public.lifeos_apply_community_report();

do $$
declare target_table text;
begin
  foreach target_table in array array[
    'lifeos_community_places', 'lifeos_community_events', 'lifeos_event_rsvps',
    'lifeos_questions', 'lifeos_answers', 'lifeos_classifieds', 'lifeos_polls',
    'lifeos_poll_options', 'lifeos_poll_votes', 'lifeos_reports'
  ] loop
    execute format('alter table public.%I enable row level security', target_table);
    execute format('revoke all on table public.%I from public, anon, authenticated', target_table);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', target_table);
  end loop;
end;
$$;

-- Profile directory access is opt-in and adds to, rather than replacing, the
-- existing self/shared-space policy.
create policy "read opted in community profiles" on public.lifeos_profiles
for select to authenticated using (
  user_id = (select auth.uid())
  or public.lifeos_shares_space_with(user_id)
  or visible_in_directory = true
);

-- Shared community rows. Hidden rows remain available to their author and a
-- moderator so review is reversible.
create policy "members read community places" on public.lifeos_community_places
for select to authenticated using (
  (select public.current_space_id()) is not null
  and (not hidden or author_id = (select auth.uid()) or (select public.lifeos_is_moderator()))
);
create policy "authors insert community places" on public.lifeos_community_places
for insert to authenticated with check (author_id = (select auth.uid()));
create policy "authors update community places" on public.lifeos_community_places
for update to authenticated using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));
create policy "authors delete community places" on public.lifeos_community_places
for delete to authenticated using (author_id = (select auth.uid()));
create policy "moderators update community places" on public.lifeos_community_places
for update to authenticated using ((select public.lifeos_is_moderator())) with check ((select public.lifeos_is_moderator()));

create policy "members read community events" on public.lifeos_community_events
for select to authenticated using (
  (select public.current_space_id()) is not null
  and (not hidden or author_id = (select auth.uid()) or (select public.lifeos_is_moderator()))
);
create policy "authors insert community events" on public.lifeos_community_events
for insert to authenticated with check (author_id = (select auth.uid()));
create policy "authors update community events" on public.lifeos_community_events
for update to authenticated using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));
create policy "authors delete community events" on public.lifeos_community_events
for delete to authenticated using (author_id = (select auth.uid()));
create policy "moderators update community events" on public.lifeos_community_events
for update to authenticated using ((select public.lifeos_is_moderator())) with check ((select public.lifeos_is_moderator()));

create policy "members read event rsvps" on public.lifeos_event_rsvps
for select to authenticated using ((select public.current_space_id()) is not null);
create policy "members insert own event rsvp" on public.lifeos_event_rsvps
for insert to authenticated with check (user_id = (select auth.uid()));
create policy "members update own event rsvp" on public.lifeos_event_rsvps
for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "members delete own event rsvp" on public.lifeos_event_rsvps
for delete to authenticated using (user_id = (select auth.uid()));

create policy "members read questions" on public.lifeos_questions
for select to authenticated using (
  (select public.current_space_id()) is not null
  and (not hidden or author_id = (select auth.uid()) or (select public.lifeos_is_moderator()))
);
create policy "authors insert questions" on public.lifeos_questions
for insert to authenticated with check (author_id = (select auth.uid()));
create policy "authors update questions" on public.lifeos_questions
for update to authenticated using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));
create policy "authors delete questions" on public.lifeos_questions
for delete to authenticated using (author_id = (select auth.uid()));
create policy "moderators update questions" on public.lifeos_questions
for update to authenticated using ((select public.lifeos_is_moderator())) with check ((select public.lifeos_is_moderator()));

create policy "members read answers" on public.lifeos_answers
for select to authenticated using (
  (select public.current_space_id()) is not null
  and (not hidden or author_id = (select auth.uid()) or (select public.lifeos_is_moderator()))
);
create policy "authors insert answers" on public.lifeos_answers
for insert to authenticated with check (author_id = (select auth.uid()));
create policy "authors update answers" on public.lifeos_answers
for update to authenticated using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));
create policy "authors delete answers" on public.lifeos_answers
for delete to authenticated using (author_id = (select auth.uid()));
create policy "moderators update answers" on public.lifeos_answers
for update to authenticated using ((select public.lifeos_is_moderator())) with check ((select public.lifeos_is_moderator()));

create policy "members read classifieds" on public.lifeos_classifieds
for select to authenticated using (
  (select public.current_space_id()) is not null
  and (not hidden or author_id = (select auth.uid()) or (select public.lifeos_is_moderator()))
);
create policy "authors insert classifieds" on public.lifeos_classifieds
for insert to authenticated with check (author_id = (select auth.uid()));
create policy "authors update classifieds" on public.lifeos_classifieds
for update to authenticated using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));
create policy "authors delete classifieds" on public.lifeos_classifieds
for delete to authenticated using (author_id = (select auth.uid()));
create policy "moderators update classifieds" on public.lifeos_classifieds
for update to authenticated using ((select public.lifeos_is_moderator())) with check ((select public.lifeos_is_moderator()));

create policy "members read polls" on public.lifeos_polls
for select to authenticated using (
  (select public.current_space_id()) is not null
  and (not hidden or author_id = (select auth.uid()) or (select public.lifeos_is_moderator()))
);
create policy "authors insert polls" on public.lifeos_polls
for insert to authenticated with check (author_id = (select auth.uid()));
create policy "authors update polls" on public.lifeos_polls
for update to authenticated using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));
create policy "authors delete polls" on public.lifeos_polls
for delete to authenticated using (author_id = (select auth.uid()));
create policy "moderators update polls" on public.lifeos_polls
for update to authenticated using ((select public.lifeos_is_moderator())) with check ((select public.lifeos_is_moderator()));

create policy "members read poll options" on public.lifeos_poll_options
for select to authenticated using ((select public.current_space_id()) is not null);
create policy "poll authors insert options" on public.lifeos_poll_options
for insert to authenticated with check (
  author_id = (select auth.uid()) and exists (
    select 1 from public.lifeos_polls poll where poll.id = poll_id and poll.author_id = (select auth.uid())
  )
);
create policy "poll authors update options" on public.lifeos_poll_options
for update to authenticated using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));
create policy "poll authors delete options" on public.lifeos_poll_options
for delete to authenticated using (author_id = (select auth.uid()));

create policy "members read poll votes" on public.lifeos_poll_votes
for select to authenticated using ((select public.current_space_id()) is not null);
create policy "members insert own poll vote" on public.lifeos_poll_votes
for insert to authenticated with check (user_id = (select auth.uid()));
create policy "members update own poll vote" on public.lifeos_poll_votes
for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "members delete own poll vote" on public.lifeos_poll_votes
for delete to authenticated using (user_id = (select auth.uid()));

create policy "members report community content" on public.lifeos_reports
for insert to authenticated with check (
  reporter_id = (select auth.uid()) and (select public.current_space_id()) is not null
);
create policy "target authors and moderators read reports" on public.lifeos_reports
for select to authenticated using (
  (select public.lifeos_is_moderator())
  or public.lifeos_is_community_target_author(target_table, target_id)
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'community-media', 'community-media', false, 8388608,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "members read community media" on storage.objects
for select to authenticated using (bucket_id = 'community-media');
create policy "members upload own community media" on storage.objects
for insert to authenticated with check (
  bucket_id = 'community-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
create policy "members update own community media" on storage.objects
for update to authenticated using (
  bucket_id = 'community-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
) with check (
  bucket_id = 'community-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
create policy "members delete own community media" on storage.objects
for delete to authenticated using (
  bucket_id = 'community-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

do $$
declare target_table text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach target_table in array array[
      'lifeos_community_places', 'lifeos_community_events', 'lifeos_event_rsvps',
      'lifeos_questions', 'lifeos_answers', 'lifeos_classifieds', 'lifeos_polls',
      'lifeos_poll_options', 'lifeos_poll_votes'
    ] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = target_table
      ) then
        execute format('alter publication supabase_realtime add table public.%I', target_table);
      end if;
    end loop;
  end if;
end;
$$;
