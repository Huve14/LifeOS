-- Policies run for the authenticated role, so they need EXECUTE on the
-- private membership predicate. The private schema remains outside the Data
-- API and has no USAGE grant, preventing clients from calling it directly.
grant execute on function private.lifeos_is_game_member(bigint) to authenticated;

create index if not exists lifeos_game_rooms_winner_idx
  on public.lifeos_game_rooms (winner_id)
  where winner_id is not null;
