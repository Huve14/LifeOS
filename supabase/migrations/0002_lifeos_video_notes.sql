-- 0002_lifeos_video_notes.sql
--
-- Async video journal. Clips persist forever, are visible to both members, and
-- carry a per-viewer watched state that doubles as a resume position.
--
-- Requires 0001_lifeos_members.sql.

create table if not exists public.lifeos_video_notes (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references auth.users (id) on delete cascade,

  -- Generated on the device before recording starts. The storage path is
  -- derived from it, so a retried upload overwrites rather than duplicates,
  -- and a retried insert conflicts rather than double-posting.
  client_id text not null unique,

  storage_path text not null unique,
  poster_path text,

  duration_seconds numeric(6, 2) not null
    check (duration_seconds >= 10 and duration_seconds <= 125),
  size_bytes bigint not null check (size_bytes > 0),
  mime_type text not null,
  width integer,
  height integer,
  caption text not null default '',

  -- When the camera stopped, per the recording device.
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists lifeos_video_notes_recorded_at_idx
  on public.lifeos_video_notes (recorded_at desc);

comment on column public.lifeos_video_notes.client_id is
  'Device-generated idempotency key. Makes upload and insert retries safe.';

-- Watched state is per viewer, not per note.
create table if not exists public.lifeos_video_note_views (
  note_id uuid not null references public.lifeos_video_notes (id) on delete cascade,
  viewer_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  watched_seconds numeric(6, 2) not null default 0,
  completed boolean not null default false,
  watched_at timestamptz not null default now(),
  primary key (note_id, viewer_id)
);

create index if not exists lifeos_video_note_views_viewer_idx
  on public.lifeos_video_note_views (viewer_id);

alter table public.lifeos_video_notes enable row level security;
alter table public.lifeos_video_note_views enable row level security;

-- Both members read every note. Only the author can create one, and only for
-- themselves.
drop policy if exists "members read video notes" on public.lifeos_video_notes;
create policy "members read video notes"
on public.lifeos_video_notes
for select
to authenticated
using (public.is_member());

drop policy if exists "author inserts video note" on public.lifeos_video_notes;
create policy "author inserts video note"
on public.lifeos_video_notes
for insert
to authenticated
with check (public.is_member() and author_id = auth.uid());

drop policy if exists "author edits own video note" on public.lifeos_video_notes;
create policy "author edits own video note"
on public.lifeos_video_notes
for update
to authenticated
using (public.is_member() and author_id = auth.uid())
with check (public.is_member() and author_id = auth.uid());

drop policy if exists "author deletes own video note" on public.lifeos_video_notes;
create policy "author deletes own video note"
on public.lifeos_video_notes
for delete
to authenticated
using (public.is_member() and author_id = auth.uid());

-- A viewer sees and writes only their own watched rows. Neither of you can
-- see whether the other has watched something, which keeps the unwatched dot
-- honest and private.
drop policy if exists "viewer reads own views" on public.lifeos_video_note_views;
create policy "viewer reads own views"
on public.lifeos_video_note_views
for select
to authenticated
using (public.is_member() and viewer_id = auth.uid());

drop policy if exists "viewer writes own views" on public.lifeos_video_note_views;
create policy "viewer writes own views"
on public.lifeos_video_note_views
for insert
to authenticated
with check (public.is_member() and viewer_id = auth.uid());

drop policy if exists "viewer updates own views" on public.lifeos_video_note_views;
create policy "viewer updates own views"
on public.lifeos_video_note_views
for update
to authenticated
using (public.is_member() and viewer_id = auth.uid())
with check (public.is_member() and viewer_id = auth.uid());

-- Live updates so a clip recorded in Abu Dhabi appears in Johannesburg without
-- a refresh. Only the notes table is published; view rows stay private.
do $$
begin
  alter publication supabase_realtime add table public.lifeos_video_notes;
exception
  when duplicate_object then null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------

-- Private bucket. Playback goes through short-lived signed URLs, which support
-- range requests, so seeking and progressive load still work.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'video-notes',
  'video-notes',
  false,
  20971520, -- 20MB hard ceiling; the client targets under 15MB
  array['video/webm', 'video/mp4', 'video/quicktime', 'image/jpeg']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "members read video note objects" on storage.objects;
create policy "members read video note objects"
on storage.objects
for select
to authenticated
using (bucket_id = 'video-notes' and public.is_member());

-- Objects live under the author's uid, so nobody can write into the other
-- person's prefix.
drop policy if exists "members write own video note objects" on storage.objects;
create policy "members write own video note objects"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'video-notes'
  and public.is_member()
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Update is needed for upsert on a retried upload.
drop policy if exists "members update own video note objects" on storage.objects;
create policy "members update own video note objects"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'video-notes'
  and public.is_member()
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'video-notes'
  and public.is_member()
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "members delete own video note objects" on storage.objects;
create policy "members delete own video note objects"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'video-notes'
  and public.is_member()
  and (storage.foldername(name))[1] = auth.uid()::text
);
