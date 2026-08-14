-- Keep deletes and updates against referenced couple records fast as the
-- shared space grows. Partial indexing avoids carrying null redemption rows.
create index if not exists lifeos_couples_created_by_idx
  on public.lifeos_couples (created_by);

create index if not exists lifeos_couple_invites_created_by_idx
  on public.lifeos_couple_invites (created_by);

create index if not exists lifeos_couple_invites_redeemed_by_idx
  on public.lifeos_couple_invites (redeemed_by)
  where redeemed_by is not null;

create index if not exists lifeos_couple_reactions_note_couple_idx
  on public.lifeos_couple_reactions (note_id, couple_id);
