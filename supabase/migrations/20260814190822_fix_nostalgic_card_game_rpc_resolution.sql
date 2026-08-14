-- Recompile the card-room RPCs with fully qualified column references.
-- This repairs projects that received the first expansion migration while the
-- corrected base migration keeps fresh installations clean.

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
