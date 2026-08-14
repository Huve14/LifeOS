-- 0009_lifeos_spaces.sql
--
-- Turns the app from a hardcoded two-person allowlist into something any
-- number of people can sign up for, alone or as a couple.
--
-- WHY THIS IS NOT OPTIONAL. Until now every lifeos_* policy asked one
-- question: "is the caller on the allowlist". With two people that means "is
-- this us". The moment a third person signs up it means "is this anybody",
-- and every user would see every other user's video notes, answers and trips.
-- Adding signups without this migration is a privacy breach, not a rough edge.
--
-- The replacement is a space. Every shared row belongs to one. A person
-- belongs to exactly one space at a time, so single user mode is simply a
-- space of one and needs no special casing anywhere.
--
-- Requires 0001 through 0008.

-- ---------------------------------------------------------------------------
-- Profiles, spaces, membership
-- ---------------------------------------------------------------------------

create table if not exists public.lifeos_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  time_zone text not null default 'UTC',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

-- One space per person at a time. This is what makes pairing a move rather
-- than an accumulation, and it keeps every policy below to a single lookup.
create unique index if not exists lifeos_one_space_per_user
  on public.lifeos_space_members (user_id);

-- ---------------------------------------------------------------------------
-- Predicates
-- ---------------------------------------------------------------------------
-- All security definer: they read membership on the caller's behalf without
-- the caller needing rights on the membership table, and without the
-- recursion a self-referencing policy would cause.

create or replace function public.current_space_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select m.space_id from public.lifeos_space_members m
  where m.user_id = auth.uid()
  limit 1;
$$;

create or replace function public.is_space_member(target uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select target is not null and exists (
    select 1 from public.lifeos_space_members m
    where m.user_id = auth.uid() and m.space_id = target
  );
$$;

/** Do the caller and this other person share a space? Used by storage. */
create or replace function public.lifeos_shares_space_with(other uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.lifeos_space_members mine
    join public.lifeos_space_members theirs on theirs.space_id = mine.space_id
    where mine.user_id = auth.uid() and theirs.user_id = other
  );
$$;

/** Safe owner check for a storage object named "<uuid>/<file>". */
create or replace function public.lifeos_owns_or_shares_object(object_name text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select case
    when object_name ~ '^[0-9a-fA-F-]{36}/'
      then public.lifeos_shares_space_with((split_part(object_name, '/', 1))::uuid)
    else false
  end;
$$;

revoke all on function public.current_space_id() from public, anon;
revoke all on function public.is_space_member(uuid) from public, anon;
revoke all on function public.lifeos_shares_space_with(uuid) from public, anon;
revoke all on function public.lifeos_owns_or_shares_object(text) from public, anon;
grant execute on function public.current_space_id() to authenticated;
grant execute on function public.is_space_member(uuid) to authenticated;
grant execute on function public.lifeos_shares_space_with(uuid) to authenticated;
grant execute on function public.lifeos_owns_or_shares_object(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Every new account gets a profile and a space of their own
-- ---------------------------------------------------------------------------

create or replace function public.lifeos_handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  new_space uuid;
begin
  insert into public.lifeos_profiles (user_id, display_name)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), split_part(new.email, '@', 1))
  )
  on conflict (user_id) do nothing;

  insert into public.lifeos_spaces (created_by) values (new.id) returning id into new_space;
  insert into public.lifeos_space_members (space_id, user_id)
  values (new_space, new.id)
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists lifeos_on_auth_user_created on auth.users;
create trigger lifeos_on_auth_user_created
after insert on auth.users
for each row execute function public.lifeos_handle_new_user();

-- ---------------------------------------------------------------------------
-- Add space_id to the shared content
-- ---------------------------------------------------------------------------

alter table public.lifeos_video_notes   add column if not exists space_id uuid references public.lifeos_spaces (id) on delete cascade;
alter table public.lifeos_prompt_answers add column if not exists space_id uuid references public.lifeos_spaces (id) on delete cascade;
alter table public.lifeos_trips          add column if not exists space_id uuid references public.lifeos_spaces (id) on delete cascade;
alter table public.lifeos_trip_items     add column if not exists space_id uuid references public.lifeos_spaces (id) on delete cascade;

-- Per-space replacement for the suveda_app_state blob. Split by module rather
-- than one document, so two people editing different screens at the same time
-- do not overwrite each other. One document would make every save a race.
create table if not exists public.lifeos_space_state (
  space_id uuid not null references public.lifeos_spaces (id) on delete cascade,
  module text not null,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  primary key (space_id, module)
);

-- ---------------------------------------------------------------------------
-- Backfill: the existing couple keeps everything, in a space of their own
-- ---------------------------------------------------------------------------

do $$
declare
  existing_space uuid;
  member record;
begin
  -- Nothing to migrate on a fresh database.
  if not exists (select 1 from public.lifeos_members) then
    return;
  end if;
  -- Idempotent: skip if the backfill already ran.
  if exists (select 1 from public.lifeos_video_notes where space_id is not null)
     or exists (select 1 from public.lifeos_space_members) then
    select m.space_id into existing_space from public.lifeos_space_members m limit 1;
  end if;

  if existing_space is null then
    insert into public.lifeos_spaces (name) values ('') returning id into existing_space;
  end if;

  for member in select * from public.lifeos_members loop
    insert into public.lifeos_profiles (user_id, display_name, time_zone)
    values (member.user_id, member.display_name, member.time_zone)
    on conflict (user_id) do update
      set display_name = excluded.display_name,
          time_zone = excluded.time_zone;

    insert into public.lifeos_space_members (space_id, user_id)
    values (existing_space, member.user_id)
    on conflict do nothing;
  end loop;

  update public.lifeos_video_notes    set space_id = existing_space where space_id is null;
  update public.lifeos_prompt_answers set space_id = existing_space where space_id is null;
  update public.lifeos_trips          set space_id = existing_space where space_id is null;
  update public.lifeos_trip_items     set space_id = existing_space where space_id is null;

  -- Carry the old per-user blob across as the space's starting state.
  insert into public.lifeos_space_state (space_id, module, payload)
  select existing_space, 'legacy', s.payload
  from public.suveda_app_state s
  join public.lifeos_members m on m.user_id::text = s.id
  order by s.updated_at desc
  limit 1
  on conflict (space_id, module) do nothing;
end;
$$;

-- Now that every row has one, require it.
alter table public.lifeos_video_notes    alter column space_id set not null;
alter table public.lifeos_prompt_answers alter column space_id set not null;
alter table public.lifeos_trips          alter column space_id set not null;
alter table public.lifeos_trip_items     alter column space_id set not null;

alter table public.lifeos_video_notes    alter column space_id set default public.current_space_id();
alter table public.lifeos_prompt_answers alter column space_id set default public.current_space_id();
alter table public.lifeos_trips          alter column space_id set default public.current_space_id();
alter table public.lifeos_trip_items     alter column space_id set default public.current_space_id();

create index if not exists lifeos_video_notes_space_idx    on public.lifeos_video_notes (space_id, recorded_at desc);
create index if not exists lifeos_prompt_answers_space_idx on public.lifeos_prompt_answers (space_id, prompt_date desc);
create index if not exists lifeos_trips_space_idx          on public.lifeos_trips (space_id, start_date);
create index if not exists lifeos_trip_items_space_idx     on public.lifeos_trip_items (space_id);

-- One answer per person per day, per space.
alter table public.lifeos_prompt_answers
  drop constraint if exists lifeos_prompt_answers_prompt_date_author_id_key;
create unique index if not exists lifeos_prompt_answers_unique_per_space
  on public.lifeos_prompt_answers (space_id, prompt_date, author_id);

-- ---------------------------------------------------------------------------
-- Rewrite every policy from the allowlist to space membership
-- ---------------------------------------------------------------------------

alter table public.lifeos_profiles      enable row level security;
alter table public.lifeos_spaces        enable row level security;
alter table public.lifeos_space_members enable row level security;
alter table public.lifeos_space_state   enable row level security;

-- Profiles: your own, plus whoever you share a space with. Not the world.
drop policy if exists "read own and shared profiles" on public.lifeos_profiles;
create policy "read own and shared profiles"
on public.lifeos_profiles for select to authenticated
using (user_id = auth.uid() or public.lifeos_shares_space_with(user_id));

drop policy if exists "write own profile" on public.lifeos_profiles;
create policy "write own profile"
on public.lifeos_profiles for update to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "insert own profile" on public.lifeos_profiles;
create policy "insert own profile"
on public.lifeos_profiles for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists "read own space" on public.lifeos_spaces;
create policy "read own space"
on public.lifeos_spaces for select to authenticated
using (public.is_space_member(id));

drop policy if exists "rename own space" on public.lifeos_spaces;
create policy "rename own space"
on public.lifeos_spaces for update to authenticated
using (public.is_space_member(id)) with check (public.is_space_member(id));

-- Membership is readable but never writable from the client. Joining goes
-- through the redeem function, which is the only thing that can move a person.
drop policy if exists "read own membership" on public.lifeos_space_members;
create policy "read own membership"
on public.lifeos_space_members for select to authenticated
using (public.is_space_member(space_id));

drop policy if exists "leave own space" on public.lifeos_space_members;
create policy "leave own space"
on public.lifeos_space_members for delete to authenticated
using (user_id = auth.uid());

drop policy if exists "space state" on public.lifeos_space_state;
create policy "space state"
on public.lifeos_space_state for all to authenticated
using (public.is_space_member(space_id))
with check (public.is_space_member(space_id));

-- Video notes
drop policy if exists "members read video notes" on public.lifeos_video_notes;
drop policy if exists "author inserts video note" on public.lifeos_video_notes;
drop policy if exists "author edits own video note" on public.lifeos_video_notes;
drop policy if exists "author deletes own video note" on public.lifeos_video_notes;

create policy "space reads video notes"
on public.lifeos_video_notes for select to authenticated
using (public.is_space_member(space_id));

create policy "author inserts video note"
on public.lifeos_video_notes for insert to authenticated
with check (public.is_space_member(space_id) and author_id = auth.uid());

create policy "author edits own video note"
on public.lifeos_video_notes for update to authenticated
using (public.is_space_member(space_id) and author_id = auth.uid())
with check (public.is_space_member(space_id) and author_id = auth.uid());

create policy "author deletes own video note"
on public.lifeos_video_notes for delete to authenticated
using (public.is_space_member(space_id) and author_id = auth.uid());

-- Watched state stays per viewer and needs no space of its own.
drop policy if exists "viewer reads own views" on public.lifeos_video_note_views;
create policy "viewer reads own views"
on public.lifeos_video_note_views for select to authenticated
using (viewer_id = auth.uid());

drop policy if exists "viewer writes own views" on public.lifeos_video_note_views;
create policy "viewer writes own views"
on public.lifeos_video_note_views for insert to authenticated
with check (viewer_id = auth.uid());

drop policy if exists "viewer updates own views" on public.lifeos_video_note_views;
create policy "viewer updates own views"
on public.lifeos_video_note_views for update to authenticated
using (viewer_id = auth.uid()) with check (viewer_id = auth.uid());

-- Prompts are shared content, not personal, so any signed in account may read
-- the questions. The answers are the private part.
drop policy if exists "members read prompts" on public.lifeos_prompts;
create policy "anyone signed in reads prompts"
on public.lifeos_prompts for select to authenticated
using (true);

-- The reveal gate, now scoped to a space rather than the whole install.
create or replace function public.lifeos_has_answered(d date)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.lifeos_prompt_answers a
    where a.prompt_date = d
      and a.author_id = auth.uid()
      and a.space_id = public.current_space_id()
  );
$$;

create or replace function public.lifeos_answered_dates()
returns table (prompt_date date, mine boolean, theirs boolean)
language sql stable security definer set search_path = public
as $$
  select
    a.prompt_date,
    bool_or(a.author_id = auth.uid()) as mine,
    bool_or(a.author_id <> auth.uid()) as theirs
  from public.lifeos_prompt_answers a
  where a.space_id = public.current_space_id()
  group by a.prompt_date
  order by a.prompt_date desc;
$$;

drop policy if exists "members read answers once both submitted" on public.lifeos_prompt_answers;
create policy "space reads answers once both submitted"
on public.lifeos_prompt_answers for select to authenticated
using (
  public.is_space_member(space_id)
  and (author_id = auth.uid() or public.lifeos_has_answered(prompt_date))
);

drop policy if exists "author writes own answer" on public.lifeos_prompt_answers;
create policy "author writes own answer"
on public.lifeos_prompt_answers for insert to authenticated
with check (public.is_space_member(space_id) and author_id = auth.uid());

drop policy if exists "author edits own answer" on public.lifeos_prompt_answers;
create policy "author edits own answer"
on public.lifeos_prompt_answers for update to authenticated
using (public.is_space_member(space_id) and author_id = auth.uid())
with check (public.is_space_member(space_id) and author_id = auth.uid());

drop policy if exists "author deletes own answer" on public.lifeos_prompt_answers;
create policy "author deletes own answer"
on public.lifeos_prompt_answers for delete to authenticated
using (public.is_space_member(space_id) and author_id = auth.uid());

-- Trips: shared within a space, both people may edit anything.
drop policy if exists "members manage trips" on public.lifeos_trips;
create policy "space manages trips"
on public.lifeos_trips for all to authenticated
using (public.is_space_member(space_id))
with check (public.is_space_member(space_id));

drop policy if exists "members manage trip items" on public.lifeos_trip_items;
create policy "space manages trip items"
on public.lifeos_trip_items for all to authenticated
using (public.is_space_member(space_id))
with check (public.is_space_member(space_id));

-- Devices stay strictly personal.
drop policy if exists "member reads own devices" on public.lifeos_devices;
create policy "reads own devices"
on public.lifeos_devices for select to authenticated using (user_id = auth.uid());

drop policy if exists "member registers own device" on public.lifeos_devices;
create policy "registers own device"
on public.lifeos_devices for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "member updates own device" on public.lifeos_devices;
create policy "updates own device"
on public.lifeos_devices for update to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "member removes own device" on public.lifeos_devices;
create policy "removes own device"
on public.lifeos_devices for delete to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Storage: readable by whoever shares a space with the owner
-- ---------------------------------------------------------------------------

drop policy if exists "members read video note objects" on storage.objects;
create policy "space reads video note objects"
on storage.objects for select to authenticated
using (bucket_id = 'video-notes' and public.lifeos_owns_or_shares_object(name));

drop policy if exists "members write own video note objects" on storage.objects;
create policy "writes own video note objects"
on storage.objects for insert to authenticated
with check (bucket_id = 'video-notes' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "members update own video note objects" on storage.objects;
create policy "updates own video note objects"
on storage.objects for update to authenticated
using (bucket_id = 'video-notes' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'video-notes' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "members delete own video note objects" on storage.objects;
create policy "deletes own video note objects"
on storage.objects for delete to authenticated
using (bucket_id = 'video-notes' and (storage.foldername(name))[1] = auth.uid()::text);

create or replace function public.lifeos_can_read_voice(object_name text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.lifeos_prompt_answers a
    where a.audio_path = object_name
      and a.space_id = public.current_space_id()
      and (a.author_id = auth.uid() or public.lifeos_has_answered(a.prompt_date))
  );
$$;

drop policy if exists "members read revealed voice notes" on storage.objects;
create policy "space reads revealed voice notes"
on storage.objects for select to authenticated
using (
  bucket_id = 'voice-notes'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.lifeos_can_read_voice(name)
  )
);

drop policy if exists "members write own voice notes" on storage.objects;
create policy "writes own voice notes"
on storage.objects for insert to authenticated
with check (bucket_id = 'voice-notes' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "members update own voice notes" on storage.objects;
create policy "updates own voice notes"
on storage.objects for update to authenticated
using (bucket_id = 'voice-notes' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'voice-notes' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "members delete own voice notes" on storage.objects;
create policy "deletes own voice notes"
on storage.objects for delete to authenticated
using (bucket_id = 'voice-notes' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- Notifications now follow the space, not the allowlist
-- ---------------------------------------------------------------------------

create or replace function public.lifeos_queue_notification()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  recipient uuid;
  sender_name text;
begin
  -- Whoever else is in the same space. In single user mode there is nobody,
  -- and nothing is queued.
  select m.user_id into recipient
  from public.lifeos_space_members m
  where m.space_id = new.space_id and m.user_id <> new.author_id
  limit 1;

  if recipient is null then
    return new;
  end if;

  select p.display_name into sender_name
  from public.lifeos_profiles p where p.user_id = new.author_id;

  if tg_table_name = 'lifeos_video_notes' then
    insert into public.lifeos_notifications (recipient_id, title, body, data)
    values (
      recipient,
      coalesce(nullif(sender_name, ''), 'A new video note'),
      'Sent you a video note.',
      jsonb_build_object('screen', 'journal', 'id', new.id)
    );

  elsif tg_table_name = 'lifeos_prompt_answers' then
    if exists (
      select 1 from public.lifeos_prompt_answers a
      where a.prompt_date = new.prompt_date
        and a.space_id = new.space_id
        and a.author_id = recipient
    ) then
      insert into public.lifeos_notifications (recipient_id, title, body, data)
      values (
        recipient,
        'Today is open',
        'You have both answered. Their answer is waiting.',
        jsonb_build_object('screen', 'prompt', 'date', new.prompt_date)
      );
    end if;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- The allowlist is finished
-- ---------------------------------------------------------------------------

drop function if exists public.is_member();
drop table if exists public.lifeos_members;
