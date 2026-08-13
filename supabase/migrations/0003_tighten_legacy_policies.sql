-- 0003_tighten_legacy_policies.sql
--
-- OPTIONAL, AND NOT PART OF THE PHASE 1 PATH. Read this before running it.
--
-- The existing policies on suveda_app_state and suveda_chat_messages carry a
-- backward-compatibility clause:
--
--     using (auth.uid()::text = id OR id = 'suveda-main')
--
-- The second half of that means any signed-in account can read and write the
-- legacy row, and signups are currently open. This migration removes the
-- escape hatch after moving any legacy data onto a real account.
--
-- It is separate from 0001 and 0002 because it touches live data that I could
-- not inspect from here. Run the checks first.
--
-- ---------------------------------------------------------------------------
-- Step 1: check what is actually in the legacy rows.
-- ---------------------------------------------------------------------------
--
--   select id, updated_at, pg_column_size(payload) as bytes
--     from public.suveda_app_state;
--
--   select thread_id, count(*)
--     from public.suveda_chat_messages
--    group by thread_id;
--
-- If nothing uses id = 'suveda-main' or thread_id = 'main', skip to step 3.
--
-- ---------------------------------------------------------------------------
-- Step 2: adopt the legacy rows onto an account. Set the uuid first.
-- ---------------------------------------------------------------------------
--
--   \set owner '00000000-0000-0000-0000-000000000000'
--
--   update public.suveda_app_state
--      set id = :'owner'
--    where id = 'suveda-main'
--      and not exists (select 1 from public.suveda_app_state where id = :'owner');
--
--   update public.suveda_chat_messages
--      set thread_id = :'owner'
--    where thread_id = 'main';
--
-- ---------------------------------------------------------------------------
-- Step 3: drop the escape hatch.
-- ---------------------------------------------------------------------------

drop policy if exists "user or legacy app state" on public.suveda_app_state;
create policy "user owns app state"
on public.suveda_app_state
for all
to authenticated
using (auth.uid()::text = id)
with check (auth.uid()::text = id);

drop policy if exists "user or legacy chat messages" on public.suveda_chat_messages;
create policy "user owns chat messages"
on public.suveda_chat_messages
for all
to authenticated
using (auth.uid()::text = thread_id)
with check (auth.uid()::text = thread_id);

-- ---------------------------------------------------------------------------
-- Deliberately left alone
-- ---------------------------------------------------------------------------
--
-- suveda_shopping_items and suveda_share_tokens stay open to anon. That is the
-- point of the /s/:token page: family members without accounts read the list
-- and claim items. Locking those down would break a shipped feature, so it is
-- not something to fix by default.
--
-- Worth knowing: anon can currently update any shopping row, not just claim a
-- field on it. If that matters, the fix is a narrow rpc for claiming rather
-- than a blanket update policy.
--
-- ---------------------------------------------------------------------------
-- Also do this, in the dashboard rather than in SQL
-- ---------------------------------------------------------------------------
--
-- Authentication > Sign In / Providers > turn off "Allow new users to sign up".
-- Both accounts already exist, and the lifeos_* tables are gated on the
-- allowlist regardless, but an open signup form on a private app is not worth
-- keeping.
