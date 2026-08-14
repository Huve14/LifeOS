-- Expand Life OS Game Night with private, server-authoritative card games.
-- Hidden hands and draw piles live in the unexposed private schema. Clients
-- receive only their own hand through a narrow authenticated RPC.

do $$
declare
  constraint_name text;
begin
  select conname into constraint_name
  from pg_constraint
  where conrelid = 'public.lifeos_game_rooms'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%game_type%'
  limit 1;

  if constraint_name is not null then
    execute format('alter table public.lifeos_game_rooms drop constraint %I', constraint_name);
  end if;

  alter table public.lifeos_game_rooms
    add constraint lifeos_game_rooms_game_type_check
    check (game_type in (
      'connect-four', 'noughts-crosses', 'memory-match',
      'draw-poker', 'blackjack', 'war', 'crazy-eights', 'go-fish'
    ));
end $$;

create table if not exists private.lifeos_game_hands (
  room_id bigint not null,
  user_id uuid not null,
  cards jsonb not null default '[]'::jsonb check (jsonb_typeof(cards) = 'array'),
  points smallint not null default 0 check (points between 0 and 52),
  stood boolean not null default false,
  meta jsonb not null default '{}'::jsonb check (jsonb_typeof(meta) = 'object'),
  updated_at timestamptz not null default now(),
  primary key (room_id, user_id),
  constraint lifeos_game_hands_participant_fkey
    foreign key (room_id, user_id)
    references public.lifeos_game_participants (room_id, user_id)
    on delete cascade
);

create table if not exists private.lifeos_game_decks (
  room_id bigint primary key references public.lifeos_game_rooms (id) on delete cascade,
  cards jsonb not null default '[]'::jsonb check (jsonb_typeof(cards) = 'array'),
  meta jsonb not null default '{}'::jsonb check (jsonb_typeof(meta) = 'object'),
  updated_at timestamptz not null default now()
);

alter table private.lifeos_game_hands enable row level security;
alter table private.lifeos_game_decks enable row level security;
revoke all on table private.lifeos_game_hands from public, anon, authenticated;
revoke all on table private.lifeos_game_decks from public, anon, authenticated;

create index if not exists lifeos_game_hands_user_room_idx
  on private.lifeos_game_hands (user_id, room_id);

create or replace function private.lifeos_card_rank_value(input_card text)
returns smallint
language sql immutable
set search_path = ''
as $$
  select case left(input_card, char_length(input_card) - 1)
    when 'A' then 14 when 'K' then 13 when 'Q' then 12 when 'J' then 11 when 'T' then 10
    else greatest(2, least(9, coalesce(nullif(left(input_card, char_length(input_card) - 1), '')::smallint, 2)))
  end;
$$;

create or replace function private.lifeos_shuffled_card_deck()
returns text[]
language sql volatile
set search_path = ''
as $$
  select array_agg(rank || suit order by random())
  from unnest(array['2','3','4','5','6','7','8','9','T','J','Q','K','A']) rank
  cross join unnest(array['S','H','D','C']) suit;
$$;

create or replace function private.lifeos_shuffle_cards(input_cards jsonb)
returns jsonb
language sql volatile
set search_path = ''
as $$
  select coalesce(jsonb_agg(card order by random()), '[]'::jsonb)
  from jsonb_array_elements(input_cards) card;
$$;

create or replace function private.lifeos_remove_card(input_cards jsonb, input_card text)
returns jsonb
language sql immutable
set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(card) order by ordinal), '[]'::jsonb)
  from jsonb_array_elements_text(input_cards) with ordinality entry(card, ordinal)
  where card <> input_card;
$$;

create or replace function private.lifeos_pop_game_deck(input_room_id bigint)
returns text
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  next_card text;
begin
  select deck.cards ->> 0 into next_card
  from private.lifeos_game_decks deck
  where deck.room_id = input_room_id
  for update;

  if next_card is null then return null; end if;

  update private.lifeos_game_decks deck
  set cards = deck.cards - 0, updated_at = now()
  where deck.room_id = input_room_id;
  return next_card;
end;
$$;

create or replace function public.lifeos_card_game_action(
  input_room_id bigint,
  input_expected_version bigint,
  input_action jsonb
)
returns table (
  room_id bigint, room_code text, room_game_type text, room_status text, room_state jsonb,
  room_version bigint, room_max_players smallint, room_owner_id uuid,
  room_winner_id uuid, room_updated_at timestamptz
)
language plpgsql security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  target_room public.lifeos_game_rooms%rowtype;
  caller_hand private.lifeos_game_hands%rowtype;
  caller_seat smallint;
  action_type text := input_action ->> 'type';
  next_seat smallint;
  next_user_id uuid;
  selected_card text;
  selected_cards jsonb;
  current_cards jsonb;
  target_cards jsonb;
  target_remaining jsonb;
  transferred_cards jsonb;
  new_card text;
  chosen_suit text;
  requested_rank text;
  target_seat smallint;
  target_user_id uuid;
  transfer_count integer := 0;
  participant_count integer;
  ready_count integer;
  next_state jsonb;
  next_status text := 'playing';
  winner_user_id uuid := null;
  winner_seats jsonb := '[]'::jsonb;
  revealed_hands jsonb := '{}'::jsonb;
  results jsonb := '{}'::jsonb;
  participant record;
  hand_score bigint;
  best_score bigint := -1;
  player_total smallint;
  dealer_total smallint;
  dealer_cards jsonb;
  deck_cards jsonb;
  deck_meta jsonb;
  discard_cards jsonb;
  top_card text;
  current_suit text;
  ready_seats jsonb;
  battle jsonb := '{}'::jsonb;
  battle_card text;
  battle_rank smallint;
  high_rank smallint := -1;
  high_seat smallint := null;
  high_tied boolean := false;
  war_pot smallint;
  remaining_cards integer;
  best_points smallint;
  best_count integer;
  success boolean := false;
begin
  if caller_id is null then raise exception 'Sign in to make a move'; end if;
  if jsonb_typeof(input_action) <> 'object' or pg_column_size(input_action) > 4096 then
    raise exception 'Invalid card-game action';
  end if;

  select room.* into target_room from public.lifeos_game_rooms room
  where room.id = input_room_id for update;
  if not found or target_room.expires_at <= now() then raise exception 'That game room is no longer available'; end if;
  if target_room.game_type not in ('draw-poker','blackjack','war','crazy-eights','go-fish') then
    raise exception 'Use the board controls for this game';
  end if;
  if target_room.status <> 'playing' then raise exception 'The game is not ready for moves'; end if;
  if target_room.version <> input_expected_version then raise exception 'The table changed. Refreshing the latest move.'; end if;

  select player.seat into caller_seat
  from public.lifeos_game_participants player
  where player.room_id = input_room_id and player.user_id = caller_id;
  if caller_seat is null then raise exception 'Only room players can make a move'; end if;

  select hand.* into caller_hand from private.lifeos_game_hands hand
  where hand.room_id = input_room_id and hand.user_id = caller_id for update;
  if not found then raise exception 'Your private hand is not ready'; end if;
  current_cards := caller_hand.cards;

  if target_room.game_type <> 'war'
    and coalesce((target_room.state ->> 'turnSeat')::smallint, -1) <> caller_seat then
    raise exception 'Wait for your turn';
  end if;

  if target_room.game_type = 'draw-poker' then
    if action_type <> 'draw' then raise exception 'Choose which cards to replace'; end if;
    selected_cards := coalesce(input_action -> 'cards', '[]'::jsonb);
    if jsonb_typeof(selected_cards) <> 'array' or jsonb_array_length(selected_cards) > 3 then
      raise exception 'Replace up to three cards';
    end if;
    if (select count(distinct value) from jsonb_array_elements_text(selected_cards)) <> jsonb_array_length(selected_cards) then
      raise exception 'Choose each card once';
    end if;

    for selected_card in select value from jsonb_array_elements_text(selected_cards)
    loop
      if not (current_cards ? selected_card) then raise exception 'That card is not in your hand'; end if;
      current_cards := private.lifeos_remove_card(current_cards, selected_card);
      new_card := private.lifeos_pop_game_deck(input_room_id);
      if new_card is null then raise exception 'The deck is out of cards'; end if;
      current_cards := current_cards || jsonb_build_array(new_card);
    end loop;

    update private.lifeos_game_hands hand
    set cards = current_cards, stood = true, meta = hand.meta || '{"acted":true}'::jsonb, updated_at = now()
    where hand.room_id = input_room_id and hand.user_id = caller_id;

    select player.seat into next_seat
    from public.lifeos_game_participants player
    join private.lifeos_game_hands hand
      on hand.room_id = player.room_id and hand.user_id = player.user_id
    where player.room_id = input_room_id
      and not coalesce((hand.meta ->> 'acted')::boolean, false)
    order by case when player.seat > caller_seat then 0 else 1 end, player.seat
    limit 1;

    if next_seat is null then
      for participant in
        select player.user_id, player.seat, hand.cards
        from public.lifeos_game_participants player
        join private.lifeos_game_hands hand on hand.room_id = player.room_id and hand.user_id = player.user_id
        where player.room_id = input_room_id order by player.seat
      loop
        revealed_hands := revealed_hands || jsonb_build_object(participant.seat::text, participant.cards);
        hand_score := private.lifeos_poker_score(participant.cards);
        if hand_score > best_score then
          best_score := hand_score;
          winner_seats := jsonb_build_array(participant.seat);
        elsif hand_score = best_score then
          winner_seats := winner_seats || jsonb_build_array(participant.seat);
        end if;
      end loop;
      if jsonb_array_length(winner_seats) = 1 then
        select user_id into winner_user_id from public.lifeos_game_participants
        where lifeos_game_participants.room_id = input_room_id and lifeos_game_participants.seat = (winner_seats ->> 0)::smallint;
      end if;
      next_status := 'finished';
      next_state := target_room.state || jsonb_build_object(
        'stage','showdown','turnSeat',null,'winnerSeat',case when jsonb_array_length(winner_seats) = 1 then (winner_seats ->> 0)::smallint else null end,
        'winnerSeats',winner_seats,'revealedHands',revealed_hands,'handCounts',private.lifeos_game_hand_counts(input_room_id),
        'moveCount',coalesce((target_room.state ->> 'moveCount')::integer,0) + 1
      );
    else
      next_state := target_room.state || jsonb_build_object('turnSeat',next_seat,'handCounts',private.lifeos_game_hand_counts(input_room_id),
        'moveCount',coalesce((target_room.state ->> 'moveCount')::integer,0) + 1);
    end if;

  elsif target_room.game_type = 'blackjack' then
    if action_type = 'hit' then
      new_card := private.lifeos_pop_game_deck(input_room_id);
      if new_card is null then raise exception 'The deck is out of cards'; end if;
      current_cards := current_cards || jsonb_build_array(new_card);
      player_total := private.lifeos_blackjack_total(current_cards);
      update private.lifeos_game_hands hand
      set cards = current_cards, stood = player_total >= 21, updated_at = now()
      where hand.room_id = input_room_id and hand.user_id = caller_id;
      if player_total < 21 then next_seat := caller_seat; end if;
    elsif action_type = 'stand' then
      update private.lifeos_game_hands hand set stood = true, updated_at = now()
      where hand.room_id = input_room_id and hand.user_id = caller_id;
    else raise exception 'Choose hit or stand'; end if;

    if next_seat is null then
      select player.seat into next_seat
      from public.lifeos_game_participants player
      join private.lifeos_game_hands hand on hand.room_id = player.room_id and hand.user_id = player.user_id
      where player.room_id = input_room_id and not hand.stood
      order by case when player.seat > caller_seat then 0 else 1 end, player.seat limit 1;
    end if;

    if next_seat is null then
      select deck.cards, deck.meta, deck.meta -> 'dealerCards' into deck_cards, deck_meta, dealer_cards
      from private.lifeos_game_decks deck where deck.room_id = input_room_id for update;
      dealer_total := private.lifeos_blackjack_total(dealer_cards);
      while dealer_total < 17 loop
        new_card := private.lifeos_pop_game_deck(input_room_id);
        exit when new_card is null;
        dealer_cards := dealer_cards || jsonb_build_array(new_card);
        dealer_total := private.lifeos_blackjack_total(dealer_cards);
      end loop;
      update private.lifeos_game_decks deck set meta = jsonb_set(deck.meta, '{dealerCards}', dealer_cards, true), updated_at = now()
      where deck.room_id = input_room_id;

      for participant in
        select player.user_id, player.seat, hand.cards
        from public.lifeos_game_participants player
        join private.lifeos_game_hands hand on hand.room_id = player.room_id and hand.user_id = player.user_id
        where player.room_id = input_room_id order by player.seat
      loop
        player_total := private.lifeos_blackjack_total(participant.cards);
        revealed_hands := revealed_hands || jsonb_build_object(participant.seat::text, participant.cards);
        if player_total > 21 then results := results || jsonb_build_object(participant.seat::text, 'bust');
        elsif dealer_total > 21 or player_total > dealer_total then
          results := results || jsonb_build_object(participant.seat::text, 'win');
          winner_seats := winner_seats || jsonb_build_array(participant.seat);
        elsif player_total = dealer_total then results := results || jsonb_build_object(participant.seat::text, 'push');
        else results := results || jsonb_build_object(participant.seat::text, 'lose'); end if;
      end loop;
      if jsonb_array_length(winner_seats) = 1 then
        select user_id into winner_user_id from public.lifeos_game_participants
        where lifeos_game_participants.room_id = input_room_id and lifeos_game_participants.seat = (winner_seats ->> 0)::smallint;
      end if;
      next_status := 'finished';
      next_state := target_room.state || jsonb_build_object(
        'stage','showdown','turnSeat',null,'winnerSeat',case when jsonb_array_length(winner_seats)=1 then (winner_seats->>0)::smallint else null end,
        'winnerSeats',winner_seats,'dealerCards',dealer_cards,'dealerCount',jsonb_array_length(dealer_cards),'dealerHidden',false,
        'dealerTotal',dealer_total,'revealedHands',revealed_hands,'results',results,'handCounts',private.lifeos_game_hand_counts(input_room_id),
        'deckCount',jsonb_array_length((select deck.cards from private.lifeos_game_decks deck where deck.room_id=input_room_id)),
        'moveCount',coalesce((target_room.state->>'moveCount')::integer,0)+1
      );
    else
      next_state := target_room.state || jsonb_build_object('turnSeat',next_seat,'handCounts',private.lifeos_game_hand_counts(input_room_id),
        'deckCount',jsonb_array_length((select deck.cards from private.lifeos_game_decks deck where deck.room_id=input_room_id)),
        'moveCount',coalesce((target_room.state->>'moveCount')::integer,0)+1);
    end if;

  elsif target_room.game_type = 'war' then
    if action_type <> 'flip' then raise exception 'Flip your next card'; end if;
    ready_seats := coalesce(target_room.state -> 'readySeats', '[]'::jsonb);
    if exists (select 1 from jsonb_array_elements_text(ready_seats) value where value::smallint = caller_seat) then
      raise exception 'Your card is ready. Waiting for the other player.';
    end if;
    ready_seats := ready_seats || to_jsonb(caller_seat);
    select count(*) into participant_count from public.lifeos_game_participants player where player.room_id = input_room_id;
    ready_count := jsonb_array_length(ready_seats);

    if ready_count < participant_count then
      next_state := target_room.state || jsonb_build_object('readySeats',ready_seats,'lastAction',jsonb_build_object('seat',caller_seat,'type','ready'),
        'moveCount',coalesce((target_room.state->>'moveCount')::integer,0)+1);
    else
      war_pot := coalesce((target_room.state ->> 'warPot')::smallint, 1);
      for participant in
        select player.user_id, player.seat, hand.cards
        from public.lifeos_game_participants player
        join private.lifeos_game_hands hand on hand.room_id=player.room_id and hand.user_id=player.user_id
        where player.room_id=input_room_id order by player.seat
      loop
        battle_card := participant.cards ->> 0;
        if battle_card is null then raise exception 'The round is already complete'; end if;
        update private.lifeos_game_hands hand set cards = hand.cards - 0, updated_at = now()
        where hand.room_id=input_room_id and hand.user_id=participant.user_id;
        battle := battle || jsonb_build_object(participant.seat::text,battle_card);
        battle_rank := private.lifeos_card_rank_value(battle_card);
        if battle_rank > high_rank then high_rank:=battle_rank; high_seat:=participant.seat; high_tied:=false;
        elsif battle_rank = high_rank then high_tied:=true; end if;
      end loop;
      if high_tied then war_pot := war_pot + 1;
      else
        update private.lifeos_game_hands hand set points=hand.points+war_pot, updated_at=now()
        from public.lifeos_game_participants player
        where hand.room_id=input_room_id and player.room_id=hand.room_id and player.user_id=hand.user_id and player.seat=high_seat;
        war_pot := 1;
      end if;

      select coalesce(sum(jsonb_array_length(cards)),0) into remaining_cards
      from private.lifeos_game_hands hand where hand.room_id=input_room_id;
      if remaining_cards = 0 then
        select max(hand.points) into best_points from private.lifeos_game_hands hand where hand.room_id=input_room_id;
        select count(*) into best_count from private.lifeos_game_hands hand where hand.room_id=input_room_id and hand.points=best_points;
        select coalesce(jsonb_agg(player.seat order by player.seat),'[]'::jsonb) into winner_seats
        from public.lifeos_game_participants player
        join private.lifeos_game_hands hand on hand.room_id=player.room_id and hand.user_id=player.user_id
        where player.room_id=input_room_id and hand.points=best_points;
        if best_count=1 then select user_id into winner_user_id from public.lifeos_game_participants
          where lifeos_game_participants.room_id=input_room_id and lifeos_game_participants.seat=(winner_seats->>0)::smallint; end if;
        next_status:='finished';
      end if;
      next_state := target_room.state || jsonb_build_object(
        'stage',case when next_status='finished' then 'showdown' else 'battle' end,'turnSeat',null,
        'winnerSeat',case when jsonb_array_length(winner_seats)=1 then (winner_seats->>0)::smallint else null end,
        'winnerSeats',winner_seats,'readySeats','[]'::jsonb,'lastBattle',battle,'scores',private.lifeos_game_scores(input_room_id),
        'handCounts',private.lifeos_game_hand_counts(input_room_id),'warPot',war_pot,
        'round',coalesce((target_room.state->>'round')::integer,0)+1,'moveCount',coalesce((target_room.state->>'moveCount')::integer,0)+1
      );
    end if;

  elsif target_room.game_type = 'crazy-eights' then
    top_card := target_room.state ->> 'topCard';
    current_suit := target_room.state ->> 'currentSuit';
    if action_type = 'play' then
      selected_card := input_action ->> 'card';
      if selected_card is null or not (current_cards ? selected_card) then raise exception 'That card is not in your hand'; end if;
      if left(selected_card,char_length(selected_card)-1) <> '8'
        and left(selected_card,char_length(selected_card)-1) <> left(top_card,char_length(top_card)-1)
        and right(selected_card,1) <> current_suit then raise exception 'Match the suit or rank, or play an eight'; end if;
      chosen_suit := case when left(selected_card,char_length(selected_card)-1)='8' then upper(input_action->>'suit') else right(selected_card,1) end;
      if chosen_suit not in ('S','H','D','C') then raise exception 'Choose the suit for your eight'; end if;
      current_cards := private.lifeos_remove_card(current_cards,selected_card);
      update private.lifeos_game_hands hand set cards=current_cards,updated_at=now() where hand.room_id=input_room_id and hand.user_id=caller_id;
      update private.lifeos_game_decks deck set meta=jsonb_set(deck.meta,'{discard}',coalesce(deck.meta->'discard','[]'::jsonb)||jsonb_build_array(selected_card),true),updated_at=now()
      where deck.room_id=input_room_id;
      if jsonb_array_length(current_cards)=0 then
        next_status:='finished'; winner_user_id:=caller_id; winner_seats:=jsonb_build_array(caller_seat); next_seat:=null;
      else next_seat:=private.lifeos_next_game_seat(input_room_id,caller_seat); end if;
      next_state := target_room.state || jsonb_build_object('stage',case when next_status='finished' then 'showdown' else 'play' end,
        'turnSeat',next_seat,'winnerSeat',case when next_status='finished' then caller_seat else null end,'winnerSeats',winner_seats,
        'topCard',selected_card,'currentSuit',chosen_suit,'handCounts',private.lifeos_game_hand_counts(input_room_id),
        'deckCount',jsonb_array_length((select deck.cards from private.lifeos_game_decks deck where deck.room_id=input_room_id)),
        'lastAction',jsonb_build_object('seat',caller_seat,'type','play','card',selected_card),
        'moveCount',coalesce((target_room.state->>'moveCount')::integer,0)+1);
    elsif action_type = 'draw' then
      select deck.cards,deck.meta into deck_cards,deck_meta from private.lifeos_game_decks deck where deck.room_id=input_room_id for update;
      if jsonb_array_length(deck_cards)=0 then
        discard_cards:=coalesce(deck_meta->'discard','[]'::jsonb);
        if jsonb_array_length(discard_cards)>1 then
          top_card:=discard_cards->>(jsonb_array_length(discard_cards)-1);
          select private.lifeos_shuffle_cards(coalesce(jsonb_agg(card order by ordinal),'[]'::jsonb)) into deck_cards
          from jsonb_array_elements(discard_cards) with ordinality entry(card,ordinal)
          where ordinal<jsonb_array_length(discard_cards);
          update private.lifeos_game_decks deck set cards=deck_cards,meta=jsonb_set(deck.meta,'{discard}',jsonb_build_array(top_card),true),updated_at=now()
          where deck.room_id=input_room_id;
        end if;
      end if;
      new_card:=private.lifeos_pop_game_deck(input_room_id);
      if new_card is not null then
        current_cards:=current_cards||jsonb_build_array(new_card);
        update private.lifeos_game_hands hand set cards=current_cards,updated_at=now() where hand.room_id=input_room_id and hand.user_id=caller_id;
      end if;
      next_seat:=private.lifeos_next_game_seat(input_room_id,caller_seat);
      next_state:=target_room.state||jsonb_build_object('turnSeat',next_seat,'handCounts',private.lifeos_game_hand_counts(input_room_id),
        'deckCount',jsonb_array_length((select deck.cards from private.lifeos_game_decks deck where deck.room_id=input_room_id)),
        'lastAction',jsonb_build_object('seat',caller_seat,'type','draw'),
        'moveCount',coalesce((target_room.state->>'moveCount')::integer,0)+1);
    else raise exception 'Play a card or draw'; end if;

  else
    if action_type <> 'ask' then raise exception 'Choose a player and a rank to ask for'; end if;
    requested_rank:=upper(input_action->>'rank');
    target_seat:=(input_action->>'targetSeat')::smallint;
    if requested_rank not in ('2','3','4','5','6','7','8','9','T','J','Q','K','A') then raise exception 'Choose a rank in your hand'; end if;
    if not exists (select 1 from jsonb_array_elements_text(current_cards) card where left(card,char_length(card)-1)=requested_rank) then
      raise exception 'You can only ask for a rank in your hand';
    end if;
    if target_seat=caller_seat then raise exception 'Ask another player'; end if;
    select player.user_id into target_user_id from public.lifeos_game_participants player where player.room_id=input_room_id and player.seat=target_seat;
    if target_user_id is null then raise exception 'Choose someone in the room'; end if;
    select hand.cards into target_cards from private.lifeos_game_hands hand where hand.room_id=input_room_id and hand.user_id=target_user_id for update;

    select coalesce(jsonb_agg(to_jsonb(card) order by ordinal),'[]'::jsonb),count(*)
    into transferred_cards,transfer_count
    from jsonb_array_elements_text(target_cards) with ordinality entry(card,ordinal)
    where left(card,char_length(card)-1)=requested_rank;

    if transfer_count>0 then
      select coalesce(jsonb_agg(to_jsonb(card) order by ordinal),'[]'::jsonb) into target_remaining
      from jsonb_array_elements_text(target_cards) with ordinality entry(card,ordinal)
      where left(card,char_length(card)-1)<>requested_rank;
      update private.lifeos_game_hands hand set cards=target_remaining,updated_at=now() where hand.room_id=input_room_id and hand.user_id=target_user_id;
      current_cards:=current_cards||transferred_cards;
      success:=true;
    else
      new_card:=private.lifeos_pop_game_deck(input_room_id);
      if new_card is not null then
        current_cards:=current_cards||jsonb_build_array(new_card);
        success:=left(new_card,char_length(new_card)-1)=requested_rank;
      end if;
    end if;
    update private.lifeos_game_hands hand set cards=current_cards,updated_at=now() where hand.room_id=input_room_id and hand.user_id=caller_id;
    perform private.lifeos_collect_go_fish_books(input_room_id,caller_id);

    next_seat:=case when success then caller_seat else private.lifeos_next_game_seat(input_room_id,caller_seat) end;
    select player.user_id into next_user_id from public.lifeos_game_participants player where player.room_id=input_room_id and player.seat=next_seat;
    if next_user_id is not null and coalesce((select jsonb_array_length(hand.cards) from private.lifeos_game_hands hand where hand.room_id=input_room_id and hand.user_id=next_user_id),0)=0
      and coalesce((select jsonb_array_length(deck.cards) from private.lifeos_game_decks deck where deck.room_id=input_room_id),0)>0 then
      new_card:=private.lifeos_pop_game_deck(input_room_id);
      update private.lifeos_game_hands hand set cards=hand.cards||jsonb_build_array(new_card),updated_at=now() where hand.room_id=input_room_id and hand.user_id=next_user_id;
      perform private.lifeos_collect_go_fish_books(input_room_id,next_user_id);
    end if;

    select coalesce(sum(jsonb_array_length(hand.cards)),0) into remaining_cards from private.lifeos_game_hands hand where hand.room_id=input_room_id;
    select coalesce(sum(hand.points),0) into best_points from private.lifeos_game_hands hand where hand.room_id=input_room_id;
    if best_points=13 or (remaining_cards=0 and coalesce((select jsonb_array_length(deck.cards) from private.lifeos_game_decks deck where deck.room_id=input_room_id),0)=0) then
      select max(hand.points) into best_points from private.lifeos_game_hands hand where hand.room_id=input_room_id;
      select count(*) into best_count from private.lifeos_game_hands hand where hand.room_id=input_room_id and hand.points=best_points;
      select coalesce(jsonb_agg(player.seat order by player.seat),'[]'::jsonb) into winner_seats
      from public.lifeos_game_participants player join private.lifeos_game_hands hand on hand.room_id=player.room_id and hand.user_id=player.user_id
      where player.room_id=input_room_id and hand.points=best_points;
      if best_count=1 then select player.user_id into winner_user_id from public.lifeos_game_participants player where player.room_id=input_room_id and player.seat=(winner_seats->>0)::smallint; end if;
      next_status:='finished'; next_seat:=null;
    end if;
    next_state:=target_room.state||jsonb_build_object('stage',case when next_status='finished' then 'showdown' else 'ask' end,
      'turnSeat',next_seat,'winnerSeat',case when jsonb_array_length(winner_seats)=1 then (winner_seats->>0)::smallint else null end,
      'winnerSeats',winner_seats,'scores',private.lifeos_game_scores(input_room_id),'handCounts',private.lifeos_game_hand_counts(input_room_id),
      'deckCount',jsonb_array_length((select deck.cards from private.lifeos_game_decks deck where deck.room_id=input_room_id)),
      'lastAction',jsonb_build_object('seat',caller_seat,'targetSeat',target_seat,'rank',requested_rank,'type',case when transfer_count>0 then 'got-cards' else 'go-fish' end,'count',transfer_count),
      'moveCount',coalesce((target_room.state->>'moveCount')::integer,0)+1);
  end if;

  update public.lifeos_game_rooms room
  set state=next_state,status=next_status,winner_id=winner_user_id,version=room.version+1,
      updated_at=now(),expires_at=greatest(room.expires_at,now()+interval '7 days')
  where room.id=input_room_id;
  return query select * from public.lifeos_game_room_snapshot(input_room_id);
end;
$$;

create or replace function public.lifeos_create_game_room(input_game_type text)
returns table (
  room_id bigint, room_code text, room_game_type text, room_status text, room_state jsonb,
  room_version bigint, room_max_players smallint, room_owner_id uuid,
  room_winner_id uuid, room_updated_at timestamptz
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
  if caller_id is null then raise exception 'Sign in to create a game room'; end if;
  if input_game_type not in (
    'connect-four','noughts-crosses','memory-match','draw-poker','blackjack','war','crazy-eights','go-fish'
  ) then raise exception 'Choose a supported game'; end if;

  select coalesce(nullif(btrim(profile.display_name), ''), 'Player') into caller_name
  from public.lifeos_profiles profile where profile.user_id = caller_id;
  caller_name := coalesce(caller_name, 'Player');
  player_limit := case input_game_type
    when 'memory-match' then 6 when 'draw-poker' then 6 when 'blackjack' then 6
    when 'crazy-eights' then 4 when 'go-fish' then 4 else 2 end;

  loop
    new_code := upper(substr(encode(extensions.gen_random_bytes(4), 'hex'), 1, 6));
    exit when not exists (select 1 from public.lifeos_game_rooms room where room.code = new_code);
  end loop;

  insert into public.lifeos_game_rooms (code, owner_id, game_type, state, max_players)
  values (new_code, caller_id, input_game_type, private.lifeos_initial_game_state(input_game_type), player_limit)
  returning id into new_room_id;

  insert into public.lifeos_game_participants (room_id, user_id, display_name, seat)
  values (new_room_id, caller_id, caller_name, 0);

  return query select room.id, room.code, room.game_type, room.status, room.state, room.version,
    room.max_players, room.owner_id, room.winner_id, room.updated_at
  from public.lifeos_game_rooms room where room.id = new_room_id;
end;
$$;

create or replace function public.lifeos_join_game_room(input_code text)
returns table (
  room_id bigint, room_code text, room_game_type text, room_status text, room_state jsonb,
  room_version bigint, room_max_players smallint, room_owner_id uuid,
  room_winner_id uuid, room_updated_at timestamptz
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
  is_existing boolean;
begin
  if caller_id is null then raise exception 'Sign in to join a game room'; end if;

  select room.* into target_room from public.lifeos_game_rooms room
  where room.code = upper(btrim(input_code)) for update;
  if not found or target_room.expires_at <= now() then raise exception 'That game room is no longer available'; end if;

  select exists (
    select 1 from public.lifeos_game_participants participant
    where participant.room_id = target_room.id and participant.user_id = caller_id
  ) into is_existing;

  if not is_existing then
    if target_room.game_type in ('draw-poker','blackjack','war','crazy-eights','go-fish')
      and target_room.status <> 'waiting' then
      raise exception 'That card game has already started';
    end if;

    select count(*) into player_count from public.lifeos_game_participants participant where participant.room_id = target_room.id;
    if player_count >= target_room.max_players then raise exception 'That game room is full'; end if;

    select candidate.seat::smallint into next_seat
    from generate_series(0, target_room.max_players - 1) candidate(seat)
    where not exists (
      select 1 from public.lifeos_game_participants participant
      where participant.room_id = target_room.id and participant.seat = candidate.seat
    ) order by candidate.seat limit 1;

    select coalesce(nullif(btrim(profile.display_name), ''), 'Player') into caller_name
    from public.lifeos_profiles profile where profile.user_id = caller_id;
    insert into public.lifeos_game_participants (room_id, user_id, display_name, seat)
    values (target_room.id, caller_id, coalesce(caller_name, 'Player'), next_seat);
  else
    update public.lifeos_game_participants participant set last_seen_at = now()
    where participant.room_id = target_room.id and participant.user_id = caller_id;
  end if;

  select count(*) into player_count from public.lifeos_game_participants participant where participant.room_id = target_room.id;
  if player_count >= 2 and target_room.status = 'waiting'
    and target_room.game_type not in ('draw-poker','blackjack','war','crazy-eights','go-fish') then
    update public.lifeos_game_rooms room set status = 'playing', updated_at = now() where room.id = target_room.id;
  end if;

  return query select room.id, room.code, room.game_type, room.status, room.state, room.version,
    room.max_players, room.owner_id, room.winner_id, room.updated_at
  from public.lifeos_game_rooms room where room.id = target_room.id;
end;
$$;

create or replace function public.lifeos_start_game_room(input_room_id bigint, input_expected_version bigint)
returns table (
  room_id bigint, room_code text, room_game_type text, room_status text, room_state jsonb,
  room_version bigint, room_max_players smallint, room_owner_id uuid,
  room_winner_id uuid, room_updated_at timestamptz
)
language plpgsql security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  target_room public.lifeos_game_rooms%rowtype;
  player_count integer;
  prepared_state jsonb;
begin
  if caller_id is null then raise exception 'Sign in to start the game'; end if;
  select room.* into target_room from public.lifeos_game_rooms room where room.id = input_room_id for update;
  if not found or target_room.expires_at <= now() then raise exception 'That game room is no longer available'; end if;
  if target_room.owner_id <> caller_id then raise exception 'Only the room host can start the game'; end if;
  if target_room.status <> 'waiting' then raise exception 'The game has already started'; end if;
  if target_room.version <> input_expected_version then raise exception 'The room changed. Refreshing it now.'; end if;
  if target_room.game_type not in ('draw-poker','blackjack','war','crazy-eights','go-fish') then
    raise exception 'This table starts automatically';
  end if;
  select count(*) into player_count from public.lifeos_game_participants participant where participant.room_id = input_room_id;
  if player_count < 2 then raise exception 'Invite at least one other player first'; end if;

  prepared_state := private.lifeos_prepare_card_game(input_room_id);
  update public.lifeos_game_rooms room
  set state = prepared_state, status = 'playing', winner_id = null,
      version = room.version + 1, updated_at = now(), expires_at = greatest(room.expires_at, now() + interval '7 days')
  where room.id = input_room_id;
  return query select * from public.lifeos_game_room_snapshot(input_room_id);
end;
$$;

create or replace function public.lifeos_my_game_hand(input_room_id bigint)
returns table (cards jsonb, points smallint, stood boolean, meta jsonb)
language sql stable security definer
set search_path = ''
as $$
  select hand.cards, hand.points, hand.stood, hand.meta
  from private.lifeos_game_hands hand
  where hand.room_id = input_room_id
    and (select auth.uid()) is not null
    and hand.user_id = (select auth.uid())
    and exists (
      select 1 from public.lifeos_game_participants participant
      where participant.room_id = input_room_id and participant.user_id = (select auth.uid())
    );
$$;

create or replace function private.lifeos_blackjack_total(input_cards jsonb)
returns smallint
language plpgsql immutable
set search_path = ''
as $$
declare
  card text;
  card_rank text;
  total smallint := 0;
  aces smallint := 0;
begin
  for card in select value from jsonb_array_elements_text(input_cards)
  loop
    card_rank := left(card, char_length(card) - 1);
    if card_rank = 'A' then total := total + 11; aces := aces + 1;
    elsif card_rank in ('T','J','Q','K') then total := total + 10;
    else total := total + card_rank::smallint;
    end if;
  end loop;
  while total > 21 and aces > 0 loop total := total - 10; aces := aces - 1; end loop;
  return total;
end;
$$;

create or replace function private.lifeos_poker_score(input_cards jsonb)
returns bigint
language plpgsql immutable
set search_path = ''
as $$
declare
  ordered_values smallint[];
  grouped_values smallint[];
  grouped_counts smallint[];
  is_flush boolean;
  is_straight boolean;
  straight_high smallint;
  category smallint := 0;
  tie_values smallint[];
  value smallint;
  position integer;
  score bigint;
begin
  if jsonb_array_length(input_cards) <> 5 then return -1; end if;

  select array_agg(rank_value order by rank_value desc),
         count(distinct suit) = 1
  into ordered_values, is_flush
  from (
    select private.lifeos_card_rank_value(card) rank_value, right(card, 1) suit
    from jsonb_array_elements_text(input_cards) card
  ) ranked;

  select array_agg(rank_value order by card_count desc, rank_value desc),
         array_agg(card_count::smallint order by card_count desc, rank_value desc)
  into grouped_values, grouped_counts
  from (
    select private.lifeos_card_rank_value(card) rank_value, count(*) card_count
    from jsonb_array_elements_text(input_cards) card
    group by private.lifeos_card_rank_value(card)
  ) grouped;

  is_straight := array_length(grouped_values, 1) = 5 and (
    ordered_values[1] - ordered_values[5] = 4
    or ordered_values = array[14,5,4,3,2]::smallint[]
  );
  straight_high := case when ordered_values = array[14,5,4,3,2]::smallint[] then 5 else ordered_values[1] end;

  if is_straight and is_flush then category := 8; tie_values := array[straight_high];
  elsif grouped_counts[1] = 4 then category := 7; tie_values := array[grouped_values[1], grouped_values[2]];
  elsif grouped_counts[1] = 3 and grouped_counts[2] = 2 then category := 6; tie_values := array[grouped_values[1], grouped_values[2]];
  elsif is_flush then category := 5; tie_values := ordered_values;
  elsif is_straight then category := 4; tie_values := array[straight_high];
  elsif grouped_counts[1] = 3 then category := 3; tie_values := grouped_values;
  elsif grouped_counts[1] = 2 and grouped_counts[2] = 2 then category := 2; tie_values := grouped_values;
  elsif grouped_counts[1] = 2 then category := 1; tie_values := grouped_values;
  else category := 0; tie_values := ordered_values;
  end if;

  score := category;
  for position in 1..5 loop
    score := score * 15 + coalesce(tie_values[position], 0);
  end loop;
  return score;
end;
$$;

create or replace function private.lifeos_game_hand_counts(input_room_id bigint)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_agg(coalesce((
    select jsonb_array_length(hand.cards)
    from private.lifeos_game_hands hand
    join public.lifeos_game_participants participant
      on participant.room_id = hand.room_id and participant.user_id = hand.user_id
    where hand.room_id = input_room_id and participant.seat = seat_number
  ), 0) order by seat_number)
  from generate_series(0, 5) seat_number;
$$;

create or replace function private.lifeos_game_scores(input_room_id bigint)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_agg(coalesce((
    select hand.points
    from private.lifeos_game_hands hand
    join public.lifeos_game_participants participant
      on participant.room_id = hand.room_id and participant.user_id = hand.user_id
    where hand.room_id = input_room_id and participant.seat = seat_number
  ), 0) order by seat_number)
  from generate_series(0, 5) seat_number;
$$;

create or replace function private.lifeos_next_game_seat(input_room_id bigint, input_seat smallint)
returns smallint
language sql stable security definer
set search_path = ''
as $$
  select participant.seat
  from public.lifeos_game_participants participant
  where participant.room_id = input_room_id and participant.seat <> input_seat
  order by case when participant.seat > input_seat then 0 else 1 end, participant.seat
  limit 1;
$$;

create or replace function private.lifeos_collect_go_fish_books(input_room_id bigint, input_user_id uuid)
returns smallint
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  current_cards jsonb;
  book_ranks text[];
  book_count smallint := 0;
begin
  select hand.cards into current_cards
  from private.lifeos_game_hands hand
  where hand.room_id = input_room_id and hand.user_id = input_user_id
  for update;

  select array_agg(card_rank), count(*)::smallint
  into book_ranks, book_count
  from (
    select left(card, char_length(card) - 1) card_rank
    from jsonb_array_elements_text(current_cards) card
    group by left(card, char_length(card) - 1)
    having count(*) = 4
  ) books;

  if coalesce(book_count, 0) = 0 then return 0; end if;

  update private.lifeos_game_hands hand
  set cards = (
        select coalesce(jsonb_agg(to_jsonb(card) order by ordinal), '[]'::jsonb)
        from jsonb_array_elements_text(current_cards) with ordinality entry(card, ordinal)
        where left(card, char_length(card) - 1) <> all(book_ranks)
      ),
      points = hand.points + book_count,
      meta = jsonb_set(hand.meta, '{books}', coalesce(hand.meta -> 'books', '[]'::jsonb) || to_jsonb(book_ranks), true),
      updated_at = now()
  where hand.room_id = input_room_id and hand.user_id = input_user_id;
  return book_count;
end;
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
    return jsonb_build_object('board', to_jsonb(array_fill(null::smallint, array[42])), 'turnSeat', 0, 'winnerSeat', null, 'moveCount', 0);
  elsif input_game_type = 'noughts-crosses' then
    return jsonb_build_object('board', to_jsonb(array_fill(null::smallint, array[9])), 'turnSeat', 0, 'winnerSeat', null, 'moveCount', 0);
  elsif input_game_type = 'memory-match' then
    select jsonb_agg(card order by random()) into shuffled_deck
    from jsonb_array_elements('["sun","shell","coffee","camera","palm","star","sun","shell","coffee","camera","palm","star"]'::jsonb) card;
    return jsonb_build_object('deck', shuffled_deck, 'revealed', '[]'::jsonb, 'matched', '[]'::jsonb,
      'scores', '[0,0,0,0,0,0]'::jsonb, 'turnSeat', 0, 'winnerSeat', null, 'moveCount', 0);
  elsif input_game_type in ('draw-poker', 'blackjack', 'war', 'crazy-eights', 'go-fish') then
    return jsonb_build_object('stage', 'waiting', 'turnSeat', 0, 'winnerSeat', null, 'winnerSeats', '[]'::jsonb,
      'handCounts', '[0,0,0,0,0,0]'::jsonb, 'scores', '[0,0,0,0,0,0]'::jsonb, 'deckCount', 0, 'moveCount', 0);
  end if;
  raise exception 'Unsupported game type';
end;
$$;

create or replace function private.lifeos_prepare_card_game(input_room_id bigint)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  target_room public.lifeos_game_rooms%rowtype;
  shuffled_deck text[];
  participant record;
  participant_count smallint;
  cards_per_player smallint;
  cursor_position integer := 1;
  player_cards jsonb;
  dealer_cards jsonb := '[]'::jsonb;
  top_card text;
  first_seat smallint;
  deck_meta jsonb := '{}'::jsonb;
begin
  select room.* into target_room from public.lifeos_game_rooms room where room.id = input_room_id;
  if not found or target_room.game_type not in ('draw-poker','blackjack','war','crazy-eights','go-fish') then
    raise exception 'Choose a card game room';
  end if;

  select count(*)::smallint, min(seat) into participant_count, first_seat
  from public.lifeos_game_participants where room_id = input_room_id;
  if participant_count < 2 then raise exception 'Invite at least one other player first'; end if;

  shuffled_deck := private.lifeos_shuffled_card_deck();
  cards_per_player := case target_room.game_type
    when 'draw-poker' then 5 when 'blackjack' then 2 when 'war' then 26
    when 'crazy-eights' then case when participant_count = 2 then 7 else 5 end
    when 'go-fish' then case when participant_count = 2 then 7 else 5 end
  end;

  delete from private.lifeos_game_hands where room_id = input_room_id;
  delete from private.lifeos_game_decks where room_id = input_room_id;

  for participant in
    select user_id, seat from public.lifeos_game_participants where room_id = input_room_id order by seat
  loop
    player_cards := to_jsonb(shuffled_deck[cursor_position:cursor_position + cards_per_player - 1]);
    cursor_position := cursor_position + cards_per_player;
    insert into private.lifeos_game_hands (room_id, user_id, cards, meta)
    values (input_room_id, participant.user_id, player_cards,
      case when target_room.game_type = 'draw-poker' then '{"acted":false}'::jsonb
           when target_room.game_type = 'go-fish' then '{"books":[]}'::jsonb else '{}'::jsonb end);
  end loop;

  if target_room.game_type = 'blackjack' then
    dealer_cards := to_jsonb(shuffled_deck[cursor_position:cursor_position + 1]);
    cursor_position := cursor_position + 2;
    deck_meta := jsonb_build_object('dealerCards', dealer_cards);
  elsif target_room.game_type = 'crazy-eights' then
    top_card := shuffled_deck[cursor_position];
    cursor_position := cursor_position + 1;
    deck_meta := jsonb_build_object('discard', jsonb_build_array(top_card));
  end if;

  insert into private.lifeos_game_decks (room_id, cards, meta)
  values (
    input_room_id,
    case when cursor_position <= array_length(shuffled_deck, 1)
      then to_jsonb(shuffled_deck[cursor_position:array_length(shuffled_deck, 1)]) else '[]'::jsonb end,
    deck_meta
  );

  if target_room.game_type = 'go-fish' then
    for participant in select user_id from public.lifeos_game_participants where room_id = input_room_id
    loop perform private.lifeos_collect_go_fish_books(input_room_id, participant.user_id); end loop;
  end if;

  if target_room.game_type = 'draw-poker' then
    return jsonb_build_object('stage','draw','turnSeat',first_seat,'winnerSeat',null,'winnerSeats','[]'::jsonb,
      'handCounts',private.lifeos_game_hand_counts(input_room_id),'moveCount',0);
  elsif target_room.game_type = 'blackjack' then
    return jsonb_build_object('stage','players','turnSeat',first_seat,'winnerSeat',null,'winnerSeats','[]'::jsonb,
      'dealerCards',jsonb_build_array(dealer_cards -> 0),'dealerCount',2,'dealerHidden',true,
      'handCounts',private.lifeos_game_hand_counts(input_room_id),'deckCount',jsonb_array_length((select cards from private.lifeos_game_decks where room_id = input_room_id)),'moveCount',0);
  elsif target_room.game_type = 'war' then
    return jsonb_build_object('stage','battle','turnSeat',first_seat,'winnerSeat',null,'winnerSeats','[]'::jsonb,
      'readySeats','[]'::jsonb,'scores',private.lifeos_game_scores(input_room_id),'handCounts',private.lifeos_game_hand_counts(input_room_id),
      'lastBattle',null,'warPot',1,'round',0,'moveCount',0);
  elsif target_room.game_type = 'crazy-eights' then
    return jsonb_build_object('stage','play','turnSeat',first_seat,'winnerSeat',null,'winnerSeats','[]'::jsonb,
      'topCard',top_card,'currentSuit',right(top_card,1),'handCounts',private.lifeos_game_hand_counts(input_room_id),
      'deckCount',jsonb_array_length((select cards from private.lifeos_game_decks where room_id = input_room_id)),'lastAction',null,'moveCount',0);
  else
    return jsonb_build_object('stage','ask','turnSeat',first_seat,'winnerSeat',null,'winnerSeats','[]'::jsonb,
      'scores',private.lifeos_game_scores(input_room_id),'handCounts',private.lifeos_game_hand_counts(input_room_id),
      'deckCount',jsonb_array_length((select cards from private.lifeos_game_decks where room_id = input_room_id)),'lastAction',null,'moveCount',0);
  end if;
end;
$$;

create or replace function public.lifeos_apply_game_move(
  input_room_id bigint,
  input_expected_version bigint,
  input_state jsonb,
  input_status text default 'playing',
  input_winner_id uuid default null
)
returns table (
  room_id bigint, room_code text, room_game_type text, room_status text, room_state jsonb,
  room_version bigint, room_max_players smallint, room_owner_id uuid,
  room_winner_id uuid, room_updated_at timestamptz
)
language plpgsql security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  target_room public.lifeos_game_rooms%rowtype;
  caller_seat smallint;
begin
  if caller_id is null then raise exception 'Sign in to make a move'; end if;
  if input_status not in ('playing','finished') then raise exception 'Invalid game status'; end if;
  if jsonb_typeof(input_state) <> 'object' or pg_column_size(input_state) > 32768 then raise exception 'Invalid game state'; end if;

  select room.* into target_room from public.lifeos_game_rooms room where room.id=input_room_id for update;
  if not found or target_room.expires_at<=now() then raise exception 'That game room is no longer available'; end if;
  if target_room.game_type in ('draw-poker','blackjack','war','crazy-eights','go-fish') then
    raise exception 'Card-game moves must use the private table controls';
  end if;
  if target_room.status<>'playing' then raise exception 'The game is not ready for moves'; end if;
  if target_room.version<>input_expected_version then raise exception 'The board changed. Refreshing the latest move.'; end if;

  select participant.seat into caller_seat from public.lifeos_game_participants participant
  where participant.room_id=input_room_id and participant.user_id=caller_id;
  if caller_seat is null then raise exception 'Only room players can make a move'; end if;
  if coalesce((target_room.state->>'turnSeat')::smallint,-1)<>caller_seat then raise exception 'Wait for your turn'; end if;
  if input_winner_id is not null and not exists (
    select 1 from public.lifeos_game_participants participant where participant.room_id=input_room_id and participant.user_id=input_winner_id
  ) then raise exception 'The winner must be in the room'; end if;

  update public.lifeos_game_rooms room
  set state=input_state,status=input_status,winner_id=input_winner_id,version=room.version+1,
      updated_at=now(),expires_at=greatest(room.expires_at,now()+interval '7 days')
  where room.id=input_room_id;
  return query select * from public.lifeos_game_room_snapshot(input_room_id);
end;
$$;

create or replace function public.lifeos_restart_game_room(input_room_id bigint, input_expected_version bigint)
returns table (
  room_id bigint, room_code text, room_game_type text, room_status text, room_state jsonb,
  room_version bigint, room_max_players smallint, room_owner_id uuid,
  room_winner_id uuid, room_updated_at timestamptz
)
language plpgsql security definer
set search_path = ''
as $$
declare
  target_room public.lifeos_game_rooms%rowtype;
  player_count integer;
  next_state jsonb;
  next_status text;
begin
  if (select auth.uid()) is null or not exists (
    select 1 from public.lifeos_game_participants participant
    where participant.room_id=input_room_id and participant.user_id=(select auth.uid())
  ) then raise exception 'Only room players can start a rematch'; end if;

  select room.* into target_room from public.lifeos_game_rooms room where room.id=input_room_id for update;
  if not found or target_room.version<>input_expected_version then raise exception 'The room changed. Refreshing it now.'; end if;
  select count(*) into player_count from public.lifeos_game_participants participant where participant.room_id=input_room_id;

  if target_room.game_type in ('draw-poker','blackjack','war','crazy-eights','go-fish') then
    if player_count>=2 then next_state:=private.lifeos_prepare_card_game(input_room_id); next_status:='playing';
    else
      delete from private.lifeos_game_hands hand where hand.room_id=input_room_id;
      delete from private.lifeos_game_decks deck where deck.room_id=input_room_id;
      next_state:=private.lifeos_initial_game_state(target_room.game_type); next_status:='waiting';
    end if;
  else
    next_state:=private.lifeos_initial_game_state(target_room.game_type);
    next_status:=case when player_count>=2 then 'playing' else 'waiting' end;
  end if;

  update public.lifeos_game_rooms room
  set state=next_state,status=next_status,winner_id=null,version=room.version+1,
      updated_at=now(),expires_at=greatest(room.expires_at,now()+interval '7 days')
  where room.id=input_room_id;
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
  game_type_value text;
begin
  if caller_id is null then return false; end if;
  select game_type into game_type_value from public.lifeos_game_rooms where id=input_room_id for update;

  delete from public.lifeos_game_participants participant
  where participant.room_id=input_room_id and participant.user_id=caller_id;
  if not found then return false; end if;

  select count(*),min(participant.user_id::text)::uuid into remaining_players,next_owner
  from public.lifeos_game_participants participant where participant.room_id=input_room_id;
  if remaining_players=0 then delete from public.lifeos_game_rooms where id=input_room_id;
  elsif game_type_value in ('draw-poker','blackjack','war','crazy-eights','go-fish') then
    delete from private.lifeos_game_hands where room_id=input_room_id;
    delete from private.lifeos_game_decks where room_id=input_room_id;
    update public.lifeos_game_rooms room
    set owner_id=case when room.owner_id=caller_id then next_owner else room.owner_id end,
        state=private.lifeos_initial_game_state(room.game_type),status='waiting',winner_id=null,
        version=room.version+1,updated_at=now()
    where room.id=input_room_id;
  else
    update public.lifeos_game_rooms room
    set owner_id=case when room.owner_id=caller_id then next_owner else room.owner_id end,
        status=case when remaining_players<2 then 'waiting' else room.status end,updated_at=now()
    where room.id=input_room_id;
  end if;
  return true;
end;
$$;

revoke all on function private.lifeos_card_rank_value(text) from public, anon, authenticated;
revoke all on function private.lifeos_shuffled_card_deck() from public, anon, authenticated;
revoke all on function private.lifeos_shuffle_cards(jsonb) from public, anon, authenticated;
revoke all on function private.lifeos_remove_card(jsonb,text) from public, anon, authenticated;
revoke all on function private.lifeos_pop_game_deck(bigint) from public, anon, authenticated;
revoke all on function private.lifeos_blackjack_total(jsonb) from public, anon, authenticated;
revoke all on function private.lifeos_poker_score(jsonb) from public, anon, authenticated;
revoke all on function private.lifeos_game_hand_counts(bigint) from public, anon, authenticated;
revoke all on function private.lifeos_game_scores(bigint) from public, anon, authenticated;
revoke all on function private.lifeos_next_game_seat(bigint,smallint) from public, anon, authenticated;
revoke all on function private.lifeos_collect_go_fish_books(bigint,uuid) from public, anon, authenticated;
revoke all on function private.lifeos_prepare_card_game(bigint) from public, anon, authenticated;
revoke all on function private.lifeos_initial_game_state(text) from public, anon, authenticated;

revoke all on function public.lifeos_create_game_room(text) from public, anon, authenticated;
revoke all on function public.lifeos_join_game_room(text) from public, anon, authenticated;
revoke all on function public.lifeos_start_game_room(bigint,bigint) from public, anon, authenticated;
revoke all on function public.lifeos_my_game_hand(bigint) from public, anon, authenticated;
revoke all on function public.lifeos_card_game_action(bigint,bigint,jsonb) from public, anon, authenticated;
revoke all on function public.lifeos_apply_game_move(bigint,bigint,jsonb,text,uuid) from public, anon, authenticated;
revoke all on function public.lifeos_restart_game_room(bigint,bigint) from public, anon, authenticated;
revoke all on function public.lifeos_leave_game_room(bigint) from public, anon, authenticated;

grant execute on function public.lifeos_create_game_room(text) to authenticated;
grant execute on function public.lifeos_join_game_room(text) to authenticated;
grant execute on function public.lifeos_start_game_room(bigint,bigint) to authenticated;
grant execute on function public.lifeos_my_game_hand(bigint) to authenticated;
grant execute on function public.lifeos_card_game_action(bigint,bigint,jsonb) to authenticated;
grant execute on function public.lifeos_apply_game_move(bigint,bigint,jsonb,text,uuid) to authenticated;
grant execute on function public.lifeos_restart_game_room(bigint,bigint) to authenticated;
grant execute on function public.lifeos_leave_game_room(bigint) to authenticated;

comment on table private.lifeos_game_hands is 'Server-private card hands; never exposed through the Data API.';
comment on table private.lifeos_game_decks is 'Server-private shuffled decks and dealer state for Life OS card games.';
