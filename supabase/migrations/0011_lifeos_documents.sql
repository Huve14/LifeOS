-- A private document vault scoped to the authenticated account.
-- Object names begin with the uploader's auth UUID, which is enforced by RLS.

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'lifeos-documents',
  'lifeos-documents',
  false,
  10485760,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "members read own document objects" on storage.objects;
create policy "members read own document objects"
on storage.objects for select to authenticated
using (
  bucket_id = 'lifeos-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "members upload own document objects" on storage.objects;
create policy "members upload own document objects"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'lifeos-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "members update own document objects" on storage.objects;
create policy "members update own document objects"
on storage.objects for update to authenticated
using (
  bucket_id = 'lifeos-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'lifeos-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "members delete own document objects" on storage.objects;
create policy "members delete own document objects"
on storage.objects for delete to authenticated
using (
  bucket_id = 'lifeos-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);
