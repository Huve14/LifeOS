-- 0009 replaces the legacy allowlist with space membership and drops
-- public.is_member() at the end. The two policies on lifeos_members itself
-- still depend on that function, so remove only those policies immediately
-- before 0009. The table remains available for 0009's data backfill.

do $$
begin
  if to_regclass('public.lifeos_members') is null then
    return;
  end if;

  drop policy if exists "members read members" on public.lifeos_members;
  drop policy if exists "member updates own profile" on public.lifeos_members;
end;
$$;
