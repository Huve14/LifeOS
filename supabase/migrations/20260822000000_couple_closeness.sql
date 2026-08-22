-- Closeness without a call.
--
-- Live audio and video calling is hidden for UAE compliance, which removes the
-- one channel that carried an unplanned "I'm thinking of you". Everything left
-- in the couple space asks you to compose something. These two tables carry the
-- things that should not need composing.
--
--   lifeos_couple_thoughts  one tap, no words, pushed to their phone
--   lifeos_couple_dates     the shared countdowns a distance actually runs on
--
-- Both follow the boundary established by 20260814215702_secure_couple_spaces:
-- membership is checked in Postgres via private.lifeos_is_couple_member, so a
-- client-side filtering mistake cannot expose another couple's rows.
--
-- Requires 20260814215702_secure_couple_spaces.sql and 0008_lifeos_devices.sql.

-- ---------------------------------------------------------------------------
-- Prerequisite: let the policies call their own membership helper
-- ---------------------------------------------------------------------------

-- Every lifeos_couple_* policy is `using (private.lifeos_is_couple_member(...))`,
-- and Postgres evaluates a policy expression as the role running the query.
-- 20260814215702 revoked EXECUTE on that helper from `authenticated`, so the
-- policy raises "permission denied for function lifeos_is_couple_member"
-- instead of returning false — which takes the entire couple space down, not
-- just the new tables below. scripts/verify-migration-chain.sh reproduces it
-- against a real cluster.
--
-- SECURITY DEFINER is what makes the lookup safe; the revoke was belt-and-
-- braces that cut the belt. Keeping the function in `private` is what keeps it
-- off the Data API — PostgREST serves only the schemas it is configured with,
-- and USAGE here does not add one. The helper takes a couple id and returns
-- whether the caller is in it, so calling it reveals nothing a member could
-- not already see.
grant usage on schema private to authenticated;
grant execute on function private.lifeos_is_couple_member(bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- Thoughts
-- ---------------------------------------------------------------------------

create table if not exists public.lifeos_couple_thoughts (
  id bigint generated always as identity primary key,
  couple_id bigint not null references public.lifeos_couples (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete cascade,
  -- A closed vocabulary. The value of a thought is that it costs one tap, so
  -- there is deliberately nowhere to type. New gestures need a migration,
  -- which is the right amount of friction for something this visible.
  gesture text not null check (gesture in ('heart', 'hug', 'smile', 'star', 'sun', 'moon')),
  created_at timestamptz not null default now(),
  seen_at timestamptz
);

create index if not exists lifeos_couple_thoughts_feed_idx
  on public.lifeos_couple_thoughts (couple_id, created_at desc);
create index if not exists lifeos_couple_thoughts_sender_idx
  on public.lifeos_couple_thoughts (sender_id, created_at desc);

alter table public.lifeos_couple_thoughts enable row level security;

create policy "couple members read their thoughts"
on public.lifeos_couple_thoughts for select to authenticated
using ((select private.lifeos_is_couple_member(couple_id)));

create policy "couple members send their own thoughts"
on public.lifeos_couple_thoughts for insert to authenticated
with check (
  (select private.lifeos_is_couple_member(couple_id))
  and sender_id = (select auth.uid())
);

-- Only the recipient marks a thought seen, and there is nothing else on the
-- row to change. Withholding update from the sender keeps "seen" honest.
create policy "recipients mark thoughts seen"
on public.lifeos_couple_thoughts for update to authenticated
using (
  (select private.lifeos_is_couple_member(couple_id))
  and sender_id <> (select auth.uid())
)
with check (
  (select private.lifeos_is_couple_member(couple_id))
  and sender_id <> (select auth.uid())
);

create policy "senders withdraw their own thoughts"
on public.lifeos_couple_thoughts for delete to authenticated
using (
  (select private.lifeos_is_couple_member(couple_id))
  and sender_id = (select auth.uid())
);

/**
 * Rate limit, enforced here rather than in the client.
 *
 * A thought that can be fired thirty times in a row stops meaning anything,
 * and the client cooldown is only a disabled button — trivially bypassed and
 * absent entirely on a second device. Thirty seconds is short enough that a
 * deliberate second gesture still goes through.
 */
create or replace function public.lifeos_throttle_couple_thought()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recent timestamptz;
begin
  select thought.created_at into recent
  from public.lifeos_couple_thoughts thought
  where thought.couple_id = new.couple_id
    and thought.sender_id = new.sender_id
  order by thought.created_at desc
  limit 1;

  if recent is not null and recent > now() - interval '30 seconds' then
    raise exception 'Give it a moment before sending another thought'
      using errcode = '53400';
  end if;

  return new;
end;
$$;

drop trigger if exists lifeos_couple_thoughts_throttle on public.lifeos_couple_thoughts;
create trigger lifeos_couple_thoughts_throttle
before insert on public.lifeos_couple_thoughts
for each row execute function public.lifeos_throttle_couple_thought();

/**
 * Queues the push. The whole point of a thought is that it arrives now rather
 * than the next time they happen to open the app.
 *
 * The body is composed here from the gesture alone. Nothing a user typed is
 * ever placed in a notification, matching the rule the prompt-answer trigger
 * follows: a notification body is visible on a locked screen.
 */
create or replace function public.lifeos_queue_couple_thought()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipient uuid;
  sender_name text;
  phrase text;
begin
  select member.user_id into recipient
  from public.lifeos_couple_members member
  where member.couple_id = new.couple_id
    and member.user_id <> new.sender_id
  limit 1;

  -- Nobody to tell yet. A solo space can still record thoughts; they simply
  -- wait for whoever joins.
  if recipient is null then
    return new;
  end if;

  select coalesce(nullif(profile.display_name, ''), 'Your person') into sender_name
  from public.lifeos_profiles profile
  where profile.user_id = new.sender_id;

  phrase := case new.gesture
    when 'heart' then 'is thinking of you.'
    when 'hug' then 'is sending you a hug.'
    when 'smile' then 'is smiling about you.'
    when 'star' then 'is proud of you.'
    when 'sun' then 'is wishing you a good morning.'
    when 'moon' then 'is wishing you goodnight.'
    else 'sent you a thought.'
  end;

  insert into public.lifeos_notifications (recipient_id, title, body, data)
  values (
    recipient,
    coalesce(sender_name, 'Your person'),
    coalesce(sender_name, 'Your person') || ' ' || phrase,
    jsonb_build_object('screen', 'space', 'thought_id', new.id, 'gesture', new.gesture)
  );

  return new;
end;
$$;

drop trigger if exists lifeos_couple_thoughts_notify on public.lifeos_couple_thoughts;
create trigger lifeos_couple_thoughts_notify
after insert on public.lifeos_couple_thoughts
for each row execute function public.lifeos_queue_couple_thought();

-- ---------------------------------------------------------------------------
-- Dates that matter
-- ---------------------------------------------------------------------------

create table if not exists public.lifeos_couple_dates (
  id bigint generated always as identity primary key,
  couple_id bigint not null references public.lifeos_couples (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  kind text not null default 'milestone'
    check (kind in ('reunion', 'anniversary', 'birthday', 'milestone')),
  label text not null check (char_length(btrim(label)) between 1 and 80),
  happens_on date not null,
  -- Anniversaries and birthdays come round again; a flight does not. The
  -- client works out the next occurrence so the stored date stays the true
  -- original one, which is what "7 years today" is counted from.
  repeats_annually boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lifeos_couple_dates_upcoming_idx
  on public.lifeos_couple_dates (couple_id, happens_on);
create index if not exists lifeos_couple_dates_author_idx
  on public.lifeos_couple_dates (created_by);

alter table public.lifeos_couple_dates enable row level security;

create policy "couple members read their dates"
on public.lifeos_couple_dates for select to authenticated
using ((select private.lifeos_is_couple_member(couple_id)));

create policy "couple members add their own dates"
on public.lifeos_couple_dates for insert to authenticated
with check (
  (select private.lifeos_is_couple_member(couple_id))
  and created_by = (select auth.uid())
);

-- Either of them may correct a date. A wrong flight date entered by one
-- person is exactly the thing the other needs to be able to fix, so these are
-- shared facts rather than authored posts.
create policy "couple members update their dates"
on public.lifeos_couple_dates for update to authenticated
using ((select private.lifeos_is_couple_member(couple_id)))
with check ((select private.lifeos_is_couple_member(couple_id)));

create policy "couple members remove their dates"
on public.lifeos_couple_dates for delete to authenticated
using ((select private.lifeos_is_couple_member(couple_id)));

-- ---------------------------------------------------------------------------
-- Grants and realtime
-- ---------------------------------------------------------------------------

-- Explicit, matching the couple tables: available even when the project has
-- disabled automatic Data API exposure for new public tables. RLS still
-- decides rows.
grant select, insert, update, delete on public.lifeos_couple_thoughts to authenticated;
grant select, insert, update, delete on public.lifeos_couple_dates to authenticated;

grant usage, select on sequence public.lifeos_couple_thoughts_id_seq,
  public.lifeos_couple_dates_id_seq to authenticated;

revoke execute on function public.lifeos_throttle_couple_thought() from public, anon, authenticated;
revoke execute on function public.lifeos_queue_couple_thought() from public, anon, authenticated;

-- Postgres Changes applies each table's RLS before delivering a row, so this
-- gives the partner an instant update without opening a public channel.
do $$
declare
  target_table text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach target_table in array array[
      'lifeos_couple_thoughts',
      'lifeos_couple_dates'
    ]
    loop
      if not exists (
        select 1
        from pg_publication_tables published
        where published.pubname = 'supabase_realtime'
          and published.schemaname = 'public'
          and published.tablename = target_table
      ) then
        execute format('alter publication supabase_realtime add table public.%I', target_table);
      end if;
    end loop;
  end if;
end;
$$;

comment on table public.lifeos_couple_thoughts is
  'One-tap wordless gestures between the two members of a couple space. Rate limited in the database.';
comment on table public.lifeos_couple_dates is
  'Shared countdowns: reunions, anniversaries, birthdays and milestones. Either member may edit any of them.';

-- Verify:
-- select gesture, count(*) from public.lifeos_couple_thoughts group by 1;
-- select kind, count(*) from public.lifeos_couple_dates group by 1;
