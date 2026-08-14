-- A deliberately shared space for two Life OS accounts.
--
-- Personal account state, journals, documents and AI history remain in their
-- existing owner-scoped tables. Only rows written to these lifeos_couple_*
-- tables are visible to a partner. Membership is enforced in Postgres so a
-- client-side filtering mistake cannot expose another couple's data.

create schema if not exists private;
revoke all on schema private from public;

create table public.lifeos_couples (
  id bigint generated always as identity primary key,
  name text not null default 'Our space'
    check (char_length(name) between 1 and 80),
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.lifeos_couple_members (
  couple_id bigint not null references public.lifeos_couples (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (couple_id, user_id),
  unique (user_id)
);

create table public.lifeos_couple_invites (
  id bigint generated always as identity primary key,
  couple_id bigint not null references public.lifeos_couples (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  code text not null unique check (code ~ '^[A-F0-9]{12}$'),
  expires_at timestamptz not null default (now() + interval '7 days'),
  redeemed_at timestamptz,
  redeemed_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index lifeos_couple_invites_active_idx
  on public.lifeos_couple_invites (couple_id, created_at desc)
  where redeemed_at is null;

create table public.lifeos_couple_notes (
  id bigint generated always as identity primary key,
  couple_id bigint not null references public.lifeos_couples (id) on delete cascade,
  author_id uuid references auth.users (id) on delete set null,
  kind text not null default 'note'
    check (kind in ('note', 'gratitude', 'celebration')),
  body text not null check (char_length(btrim(body)) between 1 and 800),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, couple_id)
);

create index lifeos_couple_notes_feed_idx
  on public.lifeos_couple_notes (couple_id, created_at desc);
create index lifeos_couple_notes_author_idx
  on public.lifeos_couple_notes (author_id);

create table public.lifeos_couple_reactions (
  note_id bigint not null,
  couple_id bigint not null references public.lifeos_couples (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  emoji text not null check (emoji in ('heart', 'hug', 'smile', 'spark')),
  created_at timestamptz not null default now(),
  primary key (note_id, user_id, emoji),
  foreign key (note_id, couple_id)
    references public.lifeos_couple_notes (id, couple_id) on delete cascade
);

create index lifeos_couple_reactions_couple_idx
  on public.lifeos_couple_reactions (couple_id, created_at desc);
create index lifeos_couple_reactions_user_idx
  on public.lifeos_couple_reactions (user_id);

create table public.lifeos_couple_checkins (
  couple_id bigint not null references public.lifeos_couples (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  checkin_date date not null default current_date,
  mood text not null check (mood in ('bright', 'steady', 'soft', 'tired', 'stretched')),
  energy smallint not null check (energy between 1 and 5),
  need text not null default '' check (char_length(need) <= 240),
  updated_at timestamptz not null default now(),
  primary key (couple_id, user_id, checkin_date)
);

create index lifeos_couple_checkins_user_idx
  on public.lifeos_couple_checkins (user_id, checkin_date desc);

create table public.lifeos_couple_ideas (
  id bigint generated always as identity primary key,
  couple_id bigint not null references public.lifeos_couples (id) on delete cascade,
  added_by uuid references auth.users (id) on delete set null,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  category text not null default 'date'
    check (category in ('date', 'home', 'travel', 'kindness')),
  status text not null default 'idea'
    check (status in ('idea', 'picked', 'done')),
  scheduled_for date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index lifeos_couple_ideas_board_idx
  on public.lifeos_couple_ideas (couple_id, status, updated_at desc);
create index lifeos_couple_ideas_author_idx
  on public.lifeos_couple_ideas (added_by);

create table public.lifeos_couple_prompt_answers (
  couple_id bigint not null references public.lifeos_couples (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  answer_date date not null default current_date,
  prompt_key text not null check (char_length(prompt_key) between 1 and 80),
  answer text not null check (char_length(btrim(answer)) between 1 and 600),
  updated_at timestamptz not null default now(),
  primary key (couple_id, user_id, answer_date)
);

create index lifeos_couple_prompt_answers_user_idx
  on public.lifeos_couple_prompt_answers (user_id, answer_date desc);

-- This predicate is kept outside the exposed public schema and performs the
-- membership lookup with a stable, indexed query. RLS policies can call it
-- without creating self-referential policy recursion on the members table.
create or replace function private.lifeos_is_couple_member(target_couple_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_couple_id is not null
    and (select auth.uid()) is not null
    and exists (
      select 1
      from public.lifeos_couple_members member
      where member.couple_id = target_couple_id
        and member.user_id = (select auth.uid())
    );
$$;

revoke execute on function private.lifeos_is_couple_member(bigint)
  from public, anon, authenticated, service_role;

alter table public.lifeos_couples enable row level security;
alter table public.lifeos_couple_members enable row level security;
alter table public.lifeos_couple_invites enable row level security;
alter table public.lifeos_couple_notes enable row level security;
alter table public.lifeos_couple_reactions enable row level security;
alter table public.lifeos_couple_checkins enable row level security;
alter table public.lifeos_couple_ideas enable row level security;
alter table public.lifeos_couple_prompt_answers enable row level security;

create policy "couple members read their couple"
on public.lifeos_couples for select to authenticated
using ((select private.lifeos_is_couple_member(id)));

create policy "couple members read their memberships"
on public.lifeos_couple_members for select to authenticated
using ((select private.lifeos_is_couple_member(couple_id)));

create policy "couple members read active invites"
on public.lifeos_couple_invites for select to authenticated
using ((select private.lifeos_is_couple_member(couple_id)));

create policy "couple members read shared notes"
on public.lifeos_couple_notes for select to authenticated
using ((select private.lifeos_is_couple_member(couple_id)));

create policy "couple members add their own shared notes"
on public.lifeos_couple_notes for insert to authenticated
with check (
  (select private.lifeos_is_couple_member(couple_id))
  and author_id = (select auth.uid())
);

create policy "authors update their shared notes"
on public.lifeos_couple_notes for update to authenticated
using (
  (select private.lifeos_is_couple_member(couple_id))
  and author_id = (select auth.uid())
)
with check (
  (select private.lifeos_is_couple_member(couple_id))
  and author_id = (select auth.uid())
);

create policy "authors delete their shared notes"
on public.lifeos_couple_notes for delete to authenticated
using (
  (select private.lifeos_is_couple_member(couple_id))
  and author_id = (select auth.uid())
);

create policy "couple members read shared reactions"
on public.lifeos_couple_reactions for select to authenticated
using ((select private.lifeos_is_couple_member(couple_id)));

create policy "couple members add their own reactions"
on public.lifeos_couple_reactions for insert to authenticated
with check (
  (select private.lifeos_is_couple_member(couple_id))
  and user_id = (select auth.uid())
);

create policy "couple members remove their own reactions"
on public.lifeos_couple_reactions for delete to authenticated
using (
  (select private.lifeos_is_couple_member(couple_id))
  and user_id = (select auth.uid())
);

create policy "couple members read daily checkins"
on public.lifeos_couple_checkins for select to authenticated
using ((select private.lifeos_is_couple_member(couple_id)));

create policy "couple members add their own checkin"
on public.lifeos_couple_checkins for insert to authenticated
with check (
  (select private.lifeos_is_couple_member(couple_id))
  and user_id = (select auth.uid())
);

create policy "couple members update their own checkin"
on public.lifeos_couple_checkins for update to authenticated
using (
  (select private.lifeos_is_couple_member(couple_id))
  and user_id = (select auth.uid())
)
with check (
  (select private.lifeos_is_couple_member(couple_id))
  and user_id = (select auth.uid())
);

create policy "couple members read shared ideas"
on public.lifeos_couple_ideas for select to authenticated
using ((select private.lifeos_is_couple_member(couple_id)));

create policy "couple members add their own ideas"
on public.lifeos_couple_ideas for insert to authenticated
with check (
  (select private.lifeos_is_couple_member(couple_id))
  and added_by = (select auth.uid())
);

create policy "couple members update shared ideas"
on public.lifeos_couple_ideas for update to authenticated
using ((select private.lifeos_is_couple_member(couple_id)))
with check ((select private.lifeos_is_couple_member(couple_id)));

create policy "idea authors delete their ideas"
on public.lifeos_couple_ideas for delete to authenticated
using (
  (select private.lifeos_is_couple_member(couple_id))
  and added_by = (select auth.uid())
);

create policy "couple members read prompt answers"
on public.lifeos_couple_prompt_answers for select to authenticated
using ((select private.lifeos_is_couple_member(couple_id)));

create policy "couple members add their own prompt answer"
on public.lifeos_couple_prompt_answers for insert to authenticated
with check (
  (select private.lifeos_is_couple_member(couple_id))
  and user_id = (select auth.uid())
);

create policy "couple members update their own prompt answer"
on public.lifeos_couple_prompt_answers for update to authenticated
using (
  (select private.lifeos_is_couple_member(couple_id))
  and user_id = (select auth.uid())
)
with check (
  (select private.lifeos_is_couple_member(couple_id))
  and user_id = (select auth.uid())
);

-- RPCs are the only write path for membership and invitation creation. Every
-- SECURITY DEFINER function checks auth.uid(), uses an empty search_path, and
-- is revoked from PUBLIC before authenticated users receive execute access.
create or replace function public.lifeos_couple_snapshot()
returns table (
  couple_id bigint,
  couple_name text,
  member_user_id uuid,
  member_display_name text,
  member_time_zone text,
  member_joined_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  my_couple_id bigint;
begin
  if me is null then
    raise exception 'Sign in to open a couple space';
  end if;

  select member.couple_id into my_couple_id
  from public.lifeos_couple_members member
  where member.user_id = me;

  if my_couple_id is null then
    return;
  end if;

  return query
  select
    couple.id,
    couple.name,
    member.user_id,
    coalesce(nullif(profile.display_name, ''), 'Partner'),
    coalesce(nullif(profile.time_zone, ''), 'UTC'),
    member.joined_at
  from public.lifeos_couples couple
  join public.lifeos_couple_members member on member.couple_id = couple.id
  left join public.lifeos_profiles profile on profile.user_id = member.user_id
  where couple.id = my_couple_id
  order by member.joined_at, member.user_id;
end;
$$;

create or replace function public.lifeos_create_couple_invite()
returns table (invite_code text, invite_expires_at timestamptz, invite_couple_id bigint)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  my_couple_id bigint;
  member_count integer;
  next_code text;
begin
  if me is null then
    raise exception 'Sign in to create an invitation';
  end if;

  select member.couple_id into my_couple_id
  from public.lifeos_couple_members member
  where member.user_id = me;

  if my_couple_id is null then
    insert into public.lifeos_couples (created_by)
    values (me)
    returning id into my_couple_id;

    insert into public.lifeos_couple_members (couple_id, user_id)
    values (my_couple_id, me);
  end if;

  perform 1 from public.lifeos_couples couple
  where couple.id = my_couple_id
  for update;

  select count(*) into member_count
  from public.lifeos_couple_members member
  where member.couple_id = my_couple_id;

  if member_count >= 2 then
    raise exception 'Your couple space is already connected';
  end if;

  update public.lifeos_couple_invites invite
  set expires_at = now()
  where invite.couple_id = my_couple_id
    and invite.redeemed_at is null
    and invite.expires_at > now();

  loop
    next_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
    exit when not exists (
      select 1 from public.lifeos_couple_invites invite where invite.code = next_code
    );
  end loop;

  insert into public.lifeos_couple_invites (couple_id, created_by, code)
  values (my_couple_id, me, next_code);

  return query
  select invite.code, invite.expires_at, invite.couple_id
  from public.lifeos_couple_invites invite
  where invite.code = next_code;
end;
$$;

create or replace function public.lifeos_join_couple(input_code text)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  normalized_code text := upper(regexp_replace(coalesce(input_code, ''), '[^A-F0-9]', '', 'g'));
  target_invite public.lifeos_couple_invites;
  my_couple_id bigint;
  target_member_count integer;
  my_member_count integer;
begin
  if me is null then
    raise exception 'Sign in to join a couple space';
  end if;
  if char_length(normalized_code) <> 12 then
    raise exception 'Enter the complete 12-character code';
  end if;

  select invite.* into target_invite
  from public.lifeos_couple_invites invite
  where invite.code = normalized_code
  for update;

  if target_invite.id is null then
    raise exception 'That invitation code is not valid';
  end if;
  if target_invite.redeemed_at is not null then
    raise exception 'That invitation has already been used';
  end if;
  if target_invite.expires_at <= now() then
    raise exception 'That invitation has expired';
  end if;
  if target_invite.created_by = me then
    raise exception 'Send this code to your partner';
  end if;

  perform 1 from public.lifeos_couples couple
  where couple.id = target_invite.couple_id
  for update;

  select member.couple_id into my_couple_id
  from public.lifeos_couple_members member
  where member.user_id = me;

  if my_couple_id = target_invite.couple_id then
    raise exception 'You are already in this couple space';
  end if;

  if my_couple_id is not null then
    select count(*) into my_member_count
    from public.lifeos_couple_members member
    where member.couple_id = my_couple_id;

    if my_member_count > 1 then
      raise exception 'Leave your current couple space before joining another';
    end if;

    delete from public.lifeos_couple_members member
    where member.user_id = me;

    delete from public.lifeos_couples couple
    where couple.id = my_couple_id
      and not exists (
        select 1 from public.lifeos_couple_members member
        where member.couple_id = my_couple_id
      );
  end if;

  select count(*) into target_member_count
  from public.lifeos_couple_members member
  where member.couple_id = target_invite.couple_id;

  if target_member_count >= 2 then
    raise exception 'That couple space is already full';
  end if;

  insert into public.lifeos_couple_members (couple_id, user_id)
  values (target_invite.couple_id, me);

  update public.lifeos_couple_invites invite
  set redeemed_at = now(), redeemed_by = me
  where invite.id = target_invite.id;

  update public.lifeos_couples couple
  set updated_at = now()
  where couple.id = target_invite.couple_id;

  return target_invite.couple_id;
end;
$$;

create or replace function public.lifeos_leave_couple()
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  my_couple_id bigint;
begin
  if me is null then
    raise exception 'Sign in to leave a couple space';
  end if;

  select member.couple_id into my_couple_id
  from public.lifeos_couple_members member
  where member.user_id = me;

  if my_couple_id is null then
    return true;
  end if;

  perform 1 from public.lifeos_couples couple
  where couple.id = my_couple_id
  for update;

  update public.lifeos_couple_invites invite
  set expires_at = now()
  where invite.couple_id = my_couple_id
    and invite.redeemed_at is null
    and invite.expires_at > now();

  delete from public.lifeos_couple_members member
  where member.user_id = me;

  delete from public.lifeos_couples couple
  where couple.id = my_couple_id
    and not exists (
      select 1 from public.lifeos_couple_members member
      where member.couple_id = my_couple_id
    );

  return true;
end;
$$;

revoke execute on function public.lifeos_couple_snapshot()
  from public, anon;
revoke execute on function public.lifeos_create_couple_invite()
  from public, anon;
revoke execute on function public.lifeos_join_couple(text)
  from public, anon;
revoke execute on function public.lifeos_leave_couple()
  from public, anon;

grant execute on function public.lifeos_couple_snapshot() to authenticated;
grant execute on function public.lifeos_create_couple_invite() to authenticated;
grant execute on function public.lifeos_join_couple(text) to authenticated;
grant execute on function public.lifeos_leave_couple() to authenticated;

-- Explicit grants keep these tables available if the project has disabled
-- automatic Data API exposure for new public tables. RLS still decides rows.
grant select on public.lifeos_couples,
  public.lifeos_couple_members,
  public.lifeos_couple_invites to authenticated;

grant select, insert, update, delete on public.lifeos_couple_notes to authenticated;
grant select, insert, delete on public.lifeos_couple_reactions to authenticated;
grant select, insert, update on public.lifeos_couple_checkins to authenticated;
grant select, insert, update, delete on public.lifeos_couple_ideas to authenticated;
grant select, insert, update on public.lifeos_couple_prompt_answers to authenticated;

grant usage, select on sequence public.lifeos_couples_id_seq,
  public.lifeos_couple_invites_id_seq,
  public.lifeos_couple_notes_id_seq,
  public.lifeos_couple_ideas_id_seq to authenticated;

-- Postgres Changes applies every table's RLS before delivering rows. These
-- additions provide instant partner updates without opening public channels.
do $$
declare
  table_name text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach table_name in array array[
      'lifeos_couple_members',
      'lifeos_couple_notes',
      'lifeos_couple_reactions',
      'lifeos_couple_checkins',
      'lifeos_couple_ideas',
      'lifeos_couple_prompt_answers'
    ]
    loop
      if not exists (
        select 1
        from pg_publication_tables published
        where published.pubname = 'supabase_realtime'
          and published.schemaname = 'public'
          and published.tablename = table_name
      ) then
        execute format('alter publication supabase_realtime add table public.%I', table_name);
      end if;
    end loop;
  end if;
end;
$$;

comment on table public.lifeos_couples is
  'A private, two-person Life OS sharing boundary. Personal account tables are never merged.';
comment on table public.lifeos_couple_notes is
  'Short notes deliberately shared between the two members of a couple space.';
