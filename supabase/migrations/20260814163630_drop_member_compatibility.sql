-- The compatibility objects were needed only by 0012 and
-- 20260814163629_private_user_accounts.sql. The private-account model is now
-- authoritative, so finish the retirement that 0009 originally intended.

drop table if exists public.lifeos_members;
drop function if exists public.is_member();
drop function if exists public.lifeos_members_guard();
