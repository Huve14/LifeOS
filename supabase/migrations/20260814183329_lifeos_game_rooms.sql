-- Life OS game rooms
--
-- Persistent, account-only multiplayer rooms for the Games space. Players
-- join through narrow RPCs; table reads are limited to room members by RLS.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists public.lifeos_game_rooms (
  id bigint generated always as identity primary key,
  code text not null unique,
  owner_id uuid not null references auth.users (id) on delete cascade,
  game_type text not null check (game_type in ('connect-four', 'noughts-crosses', 'memory-match')),
  status text not null default 'waiting' check (status in ('waiting', 'playing', 'finished')),
  state jsonb not null default '{}'::jsonb check (jsonb_typeof(state) = 'object'),
  version bigint not null default 0 check (version >= 0),
  max_players smallint not null check (max_players between 2 and 6),
  winner_id uuid references auth.users (id) on delete set null,
  expires_at timestamptz not null default now() + interval '7 days',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lifeos_game_rooms_code_format check (code ~ '^[A-Z0-9]{6}$')
);

create table if not exists public.lifeos_game_participants (
  room_id bigint not null references public.lifeos_game_rooms (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  seat smallint not null check (seat between 0 and 5),
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (room_id, user_id),
  unique (room_id, seat)
);

create index if not exists lifeos_game_rooms_owner_updated_idx
  on public.lifeos_game_rooms (owner_id, updated_at desc);
create index if not exists lifeos_game_rooms_expiry_idx
  on public.lifeos_game_rooms (expires_at)
  where status <> 'finished';
create index if not exists lifeos_game_rooms_winner_idx
  on public.lifeos_game_rooms (winner_id)
  where winner_id is not null;
create index if not exists lifeos_game_participants_user_joined_idx
  on public.lifeos_game_participants (user_id, joined_at desc);

create or replace function private.lifeos_is_game_member(input_room_id bigint)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.lifeos_game_participants participant
    where participant.room_id = input_room_id
      and participant.user_id = (select auth.uid())
  );
$$;

create or replace function private.lifeos_initial_game_state(input_game_type text)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  shuffled_deck jsonb;
begin
  if input_game_type = 'connect-four' then
    return jsonb_build_object(
      'board', to_jsonb(array_fill(null::smallint, array[42])),
      'turnSeat', 0,
      'winnerSeat', null,
      'moveCount', 0
    );
  elsif input_game_type = 'noughts-crosses' then
    return jsonb_build_object(
      'board', to_jsonb(array_fill(null::smallint, array[9])),
      'turnSeat', 0,
      'winnerSeat', null,
      'moveCount', 0
    );
  elsif input_game_type = 'memory-match' then
    select jsonb_agg(card order by random())
    into shuffled_deck
    from jsonb_array_elements(
      '["sun","shell","coffee","camera","palm","star","sun","shell","coffee","camera","palm","star"]'::jsonb
    ) card;

    return jsonb_build_object(
      'deck', shuffled_deck,
      'revealed', '[]'::jsonb,
      'matched', '[]'::jsonb,
      'scores', '[0,0,0,0,0,0]'::jsonb,
      'turnSeat', 0,
      'winnerSeat', null,
      'moveCount', 0
    );
  end if;

  raise exception 'Unsupported game type';
end;
$$;

revoke all on function private.lifeos_is_game_member(bigint) from public, anon, authenticated;
revoke all on function private.lifeos_initial_game_state(text) from public, anon, authenticated;
grant execute on function private.lifeos_is_game_member(bigint) to authenticated;

alter table public.lifeos_game_rooms enable row level security;
alter table public.lifeos_game_participants enable row level security;

drop policy if exists "members read game rooms" on public.lifeos_game_rooms;
create policy "members read game rooms"
on public.lifeos_game_rooms for select to authenticated
using ((select private.lifeos_is_game_member(id)));

drop policy if exists "members read game participants" on public.lifeos_game_participants;
create policy "members read game participants"
on public.lifeos_game_participants for select to authenticated
using ((select private.lifeos_is_game_member(room_id)));

revoke all on table public.lifeos_game_rooms from public, anon, authenticated;
revoke all on table public.lifeos_game_participants from public, anon, authenticated;
grant select on table public.lifeos_game_rooms to authenticated;
grant select on table public.lifeos_game_participants to authenticated;

create or replace function public.lifeos_create_game_room(input_game_type text)
returns table (
  room_id bigint,
  room_code text,
  room_game_type text,
  room_status text,
  room_state jsonb,
  room_version bigint,
  room_max_players smallint,
  room_owner_id uuid,
  room_winner_id uuid,
  room_updated_at timestamptz
)
language plpgsql security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  caller_name text;
  new_code text;
  new_room_id bigint;
  player_limit smallint;
begin
  if caller_id is null then
    raise exception 'Sign in to create a game room';
  end if;

  if input_game_type not in ('connect-four', 'noughts-crosses', 'memory-match') then
    raise exception 'Choose a supported game';
  end if;

  select coalesce(nullif(btrim(profile.display_name), ''), 'Player')
  into caller_name
  from public.lifeos_profiles profile
  where profile.user_id = caller_id;
  caller_name := coalesce(caller_name, 'Player');
  player_limit := case when input_game_type = 'memory-match' then 6 else 2 end;

  loop
    new_code := upper(substr(encode(extensions.gen_random_bytes(4), 'hex'), 1, 6));
    exit when not exists (
      select 1 from public.lifeos_game_rooms room where room.code = new_code
    );
  end loop;

  insert into public.lifeos_game_rooms (
    code, owner_id, game_type, state, max_players
  ) values (
    new_code,
    caller_id,
    input_game_type,
    private.lifeos_initial_game_state(input_game_type),
    player_limit
  )
  returning id into new_room_id;

  insert into public.lifeos_game_participants (room_id, user_id, display_name, seat)
  values (new_room_id, caller_id, caller_name, 0);

  return query
  select
    room.id,
    room.code,
    room.game_type,
    room.status,
    room.state,
    room.version,
    room.max_players,
    room.owner_id,
    room.winner_id,
    room.updated_at
  from public.lifeos_game_rooms room
  where room.id = new_room_id;
end;
$$;

create or replace function public.lifeos_join_game_room(input_code text)
returns table (
  room_id bigint,
  room_code text,
  room_game_type text,
  room_status text,
  room_state jsonb,
  room_version bigint,
  room_max_players smallint,
  room_owner_id uuid,
  room_winner_id uuid,
  room_updated_at timestamptz
)
language plpgsql security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  caller_name text;
  target_room public.lifeos_game_rooms%rowtype;
  next_seat smallint;
  player_count integer;
begin
  if caller_id is null then
    raise exception 'Sign in to join a game room';
  end if;

  select room.*
  into target_room
  from public.lifeos_game_rooms room
  where room.code = upper(btrim(input_code))
  for update;

  if not found or target_room.expires_at <= now() then
    raise exception 'That game room is no longer available';
  end if;

  if not exists (
    select 1 from public.lifeos_game_participants participant
    where participant.room_id = target_room.id and participant.user_id = caller_id
  ) then
    select count(*) into player_count
    from public.lifeos_game_participants participant
    where participant.room_id = target_room.id;

    if player_count >= target_room.max_players then
      raise exception 'That game room is full';
    end if;

    select candidate.seat::smallint
    into next_seat
    from generate_series(0, target_room.max_players - 1) candidate(seat)
    where not exists (
      select 1 from public.lifeos_game_participants participant
      where participant.room_id = target_room.id and participant.seat = candidate.seat
    )
    order by candidate.seat
    limit 1;

    select coalesce(nullif(btrim(profile.display_name), ''), 'Player')
    into caller_name
    from public.lifeos_profiles profile
    where profile.user_id = caller_id;

    insert into public.lifeos_game_participants (room_id, user_id, display_name, seat)
    values (target_room.id, caller_id, coalesce(caller_name, 'Player'), next_seat);
  else
    update public.lifeos_game_participants participant
    set last_seen_at = now()
    where participant.room_id = target_room.id and participant.user_id = caller_id;
  end if;

  select count(*) into player_count
  from public.lifeos_game_participants participant
  where participant.room_id = target_room.id;

  if player_count >= 2 and target_room.status = 'waiting' then
    update public.lifeos_game_rooms room
    set status = 'playing', updated_at = now()
    where room.id = target_room.id;
  end if;

  return query
  select
    room.id,
    room.code,
    room.game_type,
    room.status,
    room.state,
    room.version,
    room.max_players,
    room.owner_id,
    room.winner_id,
    room.updated_at
  from public.lifeos_game_rooms room
  where room.id = target_room.id;
end;
$$;

create or replace function public.lifeos_game_room_snapshot(input_room_id bigint)
returns table (
  room_id bigint,
  room_code text,
  room_game_type text,
  room_status text,
  room_state jsonb,
  room_version bigint,
  room_max_players smallint,
  room_owner_id uuid,
  room_winner_id uuid,
  room_updated_at timestamptz
)
language sql stable security definer
set search_path = ''
as $$
  select
    room.id,
    room.code,
    room.game_type,
    room.status,
    room.state,
    room.version,
    room.max_players,
    room.owner_id,
    room.winner_id,
    room.updated_at
  from public.lifeos_game_rooms room
  where room.id = input_room_id
    and (select auth.uid()) is not null
    and exists (
      select 1 from public.lifeos_game_participants participant
      where participant.room_id = room.id
        and participant.user_id = (select auth.uid())
    );
$$;

create or replace function public.lifeos_game_room_players(input_room_id bigint)
returns table (
  user_id uuid,
  display_name text,
  seat smallint,
  joined_at timestamptz
)
language sql stable security definer
set search_path = ''
as $$
  select participant.user_id, participant.display_name, participant.seat, participant.joined_at
  from public.lifeos_game_participants participant
  where participant.room_id = input_room_id
    and (select auth.uid()) is not null
    and exists (
      select 1 from public.lifeos_game_participants self_membership
      where self_membership.room_id = input_room_id
        and self_membership.user_id = (select auth.uid())
    )
  order by participant.seat;
$$;

create or replace function public.lifeos_apply_game_move(
  input_room_id bigint,
  input_expected_version bigint,
  input_state jsonb,
  input_status text default 'playing',
  input_winner_id uuid default null
)
returns table (
  room_id bigint,
  room_code text,
  room_game_type text,
  room_status text,
  room_state jsonb,
  room_version bigint,
  room_max_players smallint,
  room_owner_id uuid,
  room_winner_id uuid,
  room_updated_at timestamptz
)
language plpgsql security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  target_room public.lifeos_game_rooms%rowtype;
  caller_seat smallint;
begin
  if caller_id is null then
    raise exception 'Sign in to make a move';
  end if;
  if input_status not in ('playing', 'finished') then
    raise exception 'Invalid game status';
  end if;
  if jsonb_typeof(input_state) <> 'object' or pg_column_size(input_state) > 32768 then
    raise exception 'Invalid game state';
  end if;

  select room.* into target_room
  from public.lifeos_game_rooms room
  where room.id = input_room_id
  for update;

  if not found or target_room.expires_at <= now() then
    raise exception 'That game room is no longer available';
  end if;
  if target_room.status <> 'playing' then
    raise exception 'The game is not ready for moves';
  end if;
  if target_room.version <> input_expected_version then
    raise exception 'The board changed. Refreshing the latest move.';
  end if;

  select participant.seat into caller_seat
  from public.lifeos_game_participants participant
  where participant.room_id = input_room_id and participant.user_id = caller_id;

  if caller_seat is null then
    raise exception 'Only room players can make a move';
  end if;
  if coalesce((target_room.state ->> 'turnSeat')::smallint, -1) <> caller_seat then
    raise exception 'Wait for your turn';
  end if;
  if input_winner_id is not null and not exists (
    select 1 from public.lifeos_game_participants participant
    where participant.room_id = input_room_id and participant.user_id = input_winner_id
  ) then
    raise exception 'The winner must be in the room';
  end if;

  update public.lifeos_game_rooms room
  set state = input_state,
      status = input_status,
      winner_id = input_winner_id,
      version = room.version + 1,
      updated_at = now(),
      expires_at = greatest(room.expires_at, now() + interval '7 days')
  where room.id = input_room_id;

  return query select * from public.lifeos_game_room_snapshot(input_room_id);
end;
$$;

create or replace function public.lifeos_restart_game_room(
  input_room_id bigint,
  input_expected_version bigint
)
returns table (
  room_id bigint,
  room_code text,
  room_game_type text,
  room_status text,
  room_state jsonb,
  room_version bigint,
  room_max_players smallint,
  room_owner_id uuid,
  room_winner_id uuid,
  room_updated_at timestamptz
)
language plpgsql security definer
set search_path = ''
as $$
declare
  target_room public.lifeos_game_rooms%rowtype;
begin
  if (select auth.uid()) is null or not exists (
    select 1 from public.lifeos_game_participants participant
    where participant.room_id = input_room_id
      and participant.user_id = (select auth.uid())
  ) then
    raise exception 'Only room players can start a rematch';
  end if;

  select room.* into target_room
  from public.lifeos_game_rooms room
  where room.id = input_room_id
  for update;

  if not found or target_room.version <> input_expected_version then
    raise exception 'The room changed. Refreshing it now.';
  end if;

  update public.lifeos_game_rooms room
  set state = private.lifeos_initial_game_state(room.game_type),
      status = case
        when (select count(*) from public.lifeos_game_participants participant where participant.room_id = room.id) >= 2
          then 'playing'
        else 'waiting'
      end,
      winner_id = null,
      version = room.version + 1,
      updated_at = now(),
      expires_at = greatest(room.expires_at, now() + interval '7 days')
  where room.id = input_room_id;

  return query select * from public.lifeos_game_room_snapshot(input_room_id);
end;
$$;

create or replace function public.lifeos_leave_game_room(input_room_id bigint)
returns boolean
language plpgsql security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  next_owner uuid;
  remaining_players integer;
begin
  if caller_id is null then return false; end if;

  delete from public.lifeos_game_participants participant
  where participant.room_id = input_room_id and participant.user_id = caller_id;
  if not found then return false; end if;

  select count(*), min(participant.user_id::text)::uuid
  into remaining_players, next_owner
  from public.lifeos_game_participants participant
  where participant.room_id = input_room_id;

  if remaining_players = 0 then
    delete from public.lifeos_game_rooms room where room.id = input_room_id;
  else
    update public.lifeos_game_rooms room
    set owner_id = case when room.owner_id = caller_id then next_owner else room.owner_id end,
        status = case when remaining_players < 2 then 'waiting' else room.status end,
        updated_at = now()
    where room.id = input_room_id;
  end if;

  return true;
end;
$$;

revoke all on function public.lifeos_create_game_room(text) from public, anon, authenticated;
revoke all on function public.lifeos_join_game_room(text) from public, anon, authenticated;
revoke all on function public.lifeos_game_room_snapshot(bigint) from public, anon, authenticated;
revoke all on function public.lifeos_game_room_players(bigint) from public, anon, authenticated;
revoke all on function public.lifeos_apply_game_move(bigint, bigint, jsonb, text, uuid) from public, anon, authenticated;
revoke all on function public.lifeos_restart_game_room(bigint, bigint) from public, anon, authenticated;
revoke all on function public.lifeos_leave_game_room(bigint) from public, anon, authenticated;

grant execute on function public.lifeos_create_game_room(text) to authenticated;
grant execute on function public.lifeos_join_game_room(text) to authenticated;
grant execute on function public.lifeos_game_room_snapshot(bigint) to authenticated;
grant execute on function public.lifeos_game_room_players(bigint) to authenticated;
grant execute on function public.lifeos_apply_game_move(bigint, bigint, jsonb, text, uuid) to authenticated;
grant execute on function public.lifeos_restart_game_room(bigint, bigint) to authenticated;
grant execute on function public.lifeos_leave_game_room(bigint) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'lifeos_game_rooms'
  ) then
    alter publication supabase_realtime add table public.lifeos_game_rooms;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'lifeos_game_participants'
  ) then
    alter publication supabase_realtime add table public.lifeos_game_participants;
  end if;
end;
$$;

comment on table public.lifeos_game_rooms is
  'Private multiplayer Life OS board-game rooms, readable only by room members.';
comment on table public.lifeos_game_participants is
  'Public-in-room player identities and seats for Life OS game rooms.';
