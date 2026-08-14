-- 0010_lifeos_pairing.sql
--
-- Couple match codes. One person generates a code, the other enters it, and
-- from then on the two apps are the same app.
--
-- Pairing is a merge: the joiner's space is folded into the inviter's, taking
-- their content with them. That is a one way door in practice, so the app has
-- to say plainly what is about to become visible before anyone taps it. The
-- alternative designs, sharing only future content or keeping parallel private
-- spaces, both leave you with half your trips invisible to your partner.
--
-- Requires 0009_lifeos_spaces.sql.

create table if not exists public.lifeos_invites (
  code text primary key,
  space_id uuid not null references public.lifeos_spaces (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  redeemed_at timestamptz,
  redeemed_by uuid references auth.users (id) on delete set null
);

create index if not exists lifeos_invites_space_idx on public.lifeos_invites (space_id);

alter table public.lifeos_invites enable row level security;

-- You can see codes for your own space. Redeeming someone else's goes through
-- the function below, which runs as definer, so no read access is needed to
-- accept an invite. A code is therefore not enumerable by anyone.
drop policy if exists "read own space invites" on public.lifeos_invites;
create policy "read own space invites"
on public.lifeos_invites for select to authenticated
using (public.is_space_member(space_id));

-- ---------------------------------------------------------------------------
-- Generating a code
-- ---------------------------------------------------------------------------

-- No 0/O, no 1/I. This gets read aloud over a bad phone line and typed on a
-- phone keyboard, so the alphabet matters more than the entropy.
create or replace function public.lifeos_generate_code()
returns text
language plpgsql volatile security definer set search_path = public
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate text;
  i integer;
begin
  loop
    candidate := '';
    for i in 1..8 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.lifeos_invites where code = candidate);
  end loop;
  return candidate;
end;
$$;

/**
 * Returns a fresh code for the caller's space, retiring any earlier unused
 * one so only a single code is ever live. Refuses if the space is already a
 * pair, because this app is built for two.
 */
create or replace function public.lifeos_create_invite()
returns table (code text, expires_at timestamptz)
language plpgsql volatile security definer set search_path = public
as $$
declare
  my_space uuid;
  occupants integer;
  new_code text;
begin
  my_space := public.current_space_id();
  if my_space is null then
    raise exception 'You are not in a space yet';
  end if;

  select count(*) into occupants
  from public.lifeos_space_members m where m.space_id = my_space;

  if occupants >= 2 then
    raise exception 'This space is already paired';
  end if;

  update public.lifeos_invites
  set expires_at = now()
  where space_id = my_space and redeemed_at is null and expires_at > now();

  new_code := public.lifeos_generate_code();

  insert into public.lifeos_invites (code, space_id, created_by)
  values (new_code, my_space, auth.uid());

  return query
  select i.code, i.expires_at from public.lifeos_invites i where i.code = new_code;
end;
$$;

-- ---------------------------------------------------------------------------
-- Redeeming a code
-- ---------------------------------------------------------------------------

/**
 * Moves the caller into the invite's space and brings their content with them.
 * Their old space is deleted once empty.
 *
 * Definer rights, because the caller has no read access to the target space
 * until the moment they are in it. Every check below therefore has to be
 * explicit rather than relying on RLS.
 */
create or replace function public.lifeos_redeem_invite(input_code text)
returns jsonb
language plpgsql volatile security definer set search_path = public
as $$
declare
  invite public.lifeos_invites;
  me uuid := auth.uid();
  my_space uuid;
  occupants integer;
begin
  if me is null then
    raise exception 'Not signed in';
  end if;

  select * into invite
  from public.lifeos_invites
  where code = upper(btrim(input_code));

  if invite is null then
    raise exception 'That code is not valid';
  end if;
  if invite.redeemed_at is not null then
    raise exception 'That code has already been used';
  end if;
  if invite.expires_at <= now() then
    raise exception 'That code has expired';
  end if;

  my_space := public.current_space_id();
  if my_space = invite.space_id then
    raise exception 'You are already paired with this person';
  end if;

  select count(*) into occupants
  from public.lifeos_space_members m where m.space_id = invite.space_id;
  if occupants >= 2 then
    raise exception 'That space is already paired';
  end if;

  -- Carry the joiner's content across. Their views and devices are keyed to
  -- them personally and need no change.
  if my_space is not null then
    update public.lifeos_video_notes    set space_id = invite.space_id where space_id = my_space;
    update public.lifeos_prompt_answers set space_id = invite.space_id where space_id = my_space;
    update public.lifeos_trips          set space_id = invite.space_id where space_id = my_space;
    update public.lifeos_trip_items     set space_id = invite.space_id where space_id = my_space;

    -- State is per module and both sides may hold the same module. The
    -- inviter's copy wins, because they are the space being joined; the
    -- joiner's is kept under a suffixed key rather than silently binned.
    insert into public.lifeos_space_state (space_id, module, payload, updated_at, updated_by)
    select invite.space_id, s.module || ':joined', s.payload, s.updated_at, s.updated_by
    from public.lifeos_space_state s
    where s.space_id = my_space
      and exists (
        select 1 from public.lifeos_space_state t
        where t.space_id = invite.space_id and t.module = s.module
      )
    on conflict (space_id, module) do nothing;

    update public.lifeos_space_state s
    set space_id = invite.space_id
    where s.space_id = my_space
      and not exists (
        select 1 from public.lifeos_space_state t
        where t.space_id = invite.space_id and t.module = s.module
      );
  end if;

  -- Move the person. The unique index on user_id makes this a move, not a
  -- second membership.
  delete from public.lifeos_space_members where user_id = me;
  insert into public.lifeos_space_members (space_id, user_id) values (invite.space_id, me);

  update public.lifeos_invites
  set redeemed_at = now(), redeemed_by = me
  where code = invite.code;

  -- The empty space is rubbish now. Cascades clean up anything left.
  if my_space is not null then
    delete from public.lifeos_spaces
    where id = my_space
      and not exists (select 1 from public.lifeos_space_members m where m.space_id = my_space);
  end if;

  return jsonb_build_object('space_id', invite.space_id, 'paired', true);
end;
$$;

/**
 * Leaves the current space and starts a fresh empty one.
 *
 * Deliberately does not take content back. Working out who contributed what
 * after months of shared editing is guesswork, and guessing wrong either
 * deletes something someone wanted or hands over something they did not.
 * The app says so before anyone taps it.
 */
create or replace function public.lifeos_leave_space()
returns jsonb
language plpgsql volatile security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  old_space uuid;
  new_space uuid;
begin
  if me is null then
    raise exception 'Not signed in';
  end if;

  old_space := public.current_space_id();

  delete from public.lifeos_space_members where user_id = me;

  insert into public.lifeos_spaces (created_by) values (me) returning id into new_space;
  insert into public.lifeos_space_members (space_id, user_id) values (new_space, me);

  if old_space is not null then
    delete from public.lifeos_spaces
    where id = old_space
      and not exists (select 1 from public.lifeos_space_members m where m.space_id = old_space);
  end if;

  return jsonb_build_object('space_id', new_space, 'paired', false);
end;
$$;

revoke all on function public.lifeos_generate_code() from public, anon;
revoke all on function public.lifeos_create_invite() from public, anon;
revoke all on function public.lifeos_redeem_invite(text) from public, anon;
revoke all on function public.lifeos_leave_space() from public, anon;
grant execute on function public.lifeos_create_invite() to authenticated;
grant execute on function public.lifeos_redeem_invite(text) to authenticated;
grant execute on function public.lifeos_leave_space() to authenticated;

-- ---------------------------------------------------------------------------
-- Backfill profiles and spaces for accounts that predate the trigger
-- ---------------------------------------------------------------------------

insert into public.lifeos_profiles (user_id, display_name)
select u.id, coalesce(nullif(u.raw_user_meta_data ->> 'name', ''), split_part(u.email, '@', 1))
from auth.users u
where not exists (select 1 from public.lifeos_profiles p where p.user_id = u.id);

do $$
declare
  orphan record;
  fresh uuid;
begin
  for orphan in
    select u.id from auth.users u
    where not exists (select 1 from public.lifeos_space_members m where m.user_id = u.id)
  loop
    insert into public.lifeos_spaces (created_by) values (orphan.id) returning id into fresh;
    insert into public.lifeos_space_members (space_id, user_id) values (fresh, orphan.id);
  end loop;
end;
$$;

-- Verify: every account has exactly one profile and one space.
-- select count(*) from auth.users;
-- select count(*) from public.lifeos_profiles;
-- select count(*) from public.lifeos_space_members;
