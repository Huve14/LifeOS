-- 0004_lifeos_prompts.sql
--
-- Daily prompt. One question a day, the same one for both of us, and neither
-- answer is readable until both have been submitted.
--
-- The reveal is enforced here rather than in the UI. Until you have answered a
-- given day, the other person's row is not returned by the API at all, so
-- there is nothing to peek at in the network tab.
--
-- Requires 0001_lifeos_members.sql.
-- Prompt text is seeded by 0005_lifeos_prompt_seed.sql.

create table if not exists public.lifeos_prompts (
  day_index integer primary key check (day_index >= 0 and day_index < 365),
  text text not null check (length(btrim(text)) > 0)
);

comment on table public.lifeos_prompts is
  'The 365 question rotation. The client maps a date to a day_index; see PROMPT_EPOCH in src/lifeos/prompts.ts.';

create table if not exists public.lifeos_prompt_answers (
  id uuid primary key default gen_random_uuid(),

  -- Calendar date in Asia/Dubai, which is what makes "today" mean one thing
  -- for two people two hours apart.
  prompt_date date not null,
  author_id uuid not null default auth.uid() references auth.users (id) on delete cascade,

  -- Device-generated, so a queued answer can be retried without duplicating.
  client_id text not null unique,

  body text not null default '',
  audio_path text,
  audio_duration_seconds numeric(6, 2),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (prompt_date, author_id),
  constraint lifeos_prompt_answers_not_empty
    check (length(btrim(body)) > 0 or audio_path is not null)
);

create index if not exists lifeos_prompt_answers_date_idx
  on public.lifeos_prompt_answers (prompt_date desc);

-- ---------------------------------------------------------------------------
-- Reveal gate
-- ---------------------------------------------------------------------------

-- Security definer, because a policy on lifeos_prompt_answers that queries
-- lifeos_prompt_answers would recurse through its own RLS. Definer rights read
-- the table directly, which breaks the cycle.
create or replace function public.lifeos_has_answered(d date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.lifeos_prompt_answers a
    where a.prompt_date = d
      and a.author_id = auth.uid()
  );
$$;

revoke all on function public.lifeos_has_answered(date) from public, anon;
grant execute on function public.lifeos_has_answered(date) to authenticated;

-- Which days have answers, and from whom. Existence only, no content, so the
-- archive can show "waiting on you" without giving anything away early.
create or replace function public.lifeos_answered_dates()
returns table (prompt_date date, mine boolean, theirs boolean)
language sql
stable
security definer
set search_path = public
as $$
  select
    a.prompt_date,
    bool_or(a.author_id = auth.uid()) as mine,
    bool_or(a.author_id <> auth.uid()) as theirs
  from public.lifeos_prompt_answers a
  where public.is_member()
  group by a.prompt_date
  order by a.prompt_date desc;
$$;

revoke all on function public.lifeos_answered_dates() from public, anon;
grant execute on function public.lifeos_answered_dates() to authenticated;

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------

alter table public.lifeos_prompts enable row level security;
alter table public.lifeos_prompt_answers enable row level security;

drop policy if exists "members read prompts" on public.lifeos_prompts;
create policy "members read prompts"
on public.lifeos_prompts
for select
to authenticated
using (public.is_member());

-- Your own answer always. Theirs only once yours exists for that day.
drop policy if exists "members read answers once both submitted" on public.lifeos_prompt_answers;
create policy "members read answers once both submitted"
on public.lifeos_prompt_answers
for select
to authenticated
using (
  public.is_member()
  and (
    author_id = auth.uid()
    or public.lifeos_has_answered(prompt_date)
  )
);

drop policy if exists "author writes own answer" on public.lifeos_prompt_answers;
create policy "author writes own answer"
on public.lifeos_prompt_answers
for insert
to authenticated
with check (public.is_member() and author_id = auth.uid());

drop policy if exists "author edits own answer" on public.lifeos_prompt_answers;
create policy "author edits own answer"
on public.lifeos_prompt_answers
for update
to authenticated
using (public.is_member() and author_id = auth.uid())
with check (public.is_member() and author_id = auth.uid());

drop policy if exists "author deletes own answer" on public.lifeos_prompt_answers;
create policy "author deletes own answer"
on public.lifeos_prompt_answers
for delete
to authenticated
using (public.is_member() and author_id = auth.uid());

-- Realtime, so the reveal happens the moment the second answer lands rather
-- than on the next refresh. RLS still applies to the change feed, so an
-- unrevealed insert produces no event on the other device.
do $$
begin
  alter publication supabase_realtime add table public.lifeos_prompt_answers;
exception
  when duplicate_object then null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Voice notes
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'voice-notes',
  'voice-notes',
  false,
  10485760, -- 10MB; a 90 second note at 64kbps is under 1MB
  array['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/aac', 'audio/ogg']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- The gate has to cover the audio too, otherwise a voice answer would be
-- readable before the reveal by anyone who guessed the object path.
create or replace function public.lifeos_can_read_voice(object_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.lifeos_prompt_answers a
    where a.audio_path = object_name
      and (
        a.author_id = auth.uid()
        or public.lifeos_has_answered(a.prompt_date)
      )
  );
$$;

revoke all on function public.lifeos_can_read_voice(text) from public, anon;
grant execute on function public.lifeos_can_read_voice(text) to authenticated;

drop policy if exists "members read revealed voice notes" on storage.objects;
create policy "members read revealed voice notes"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'voice-notes'
  and public.is_member()
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.lifeos_can_read_voice(name)
  )
);

drop policy if exists "members write own voice notes" on storage.objects;
create policy "members write own voice notes"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'voice-notes'
  and public.is_member()
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "members update own voice notes" on storage.objects;
create policy "members update own voice notes"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'voice-notes'
  and public.is_member()
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'voice-notes'
  and public.is_member()
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "members delete own voice notes" on storage.objects;
create policy "members delete own voice notes"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'voice-notes'
  and public.is_member()
  and (storage.foldername(name))[1] = auth.uid()::text
);
