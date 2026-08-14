-- 0008_lifeos_devices.sql
--
-- APNs device tokens for the native iOS app.
--
-- A token identifies a device, not a person, and rotates on reinstall, so the
-- token itself is the conflict key rather than the user. One person can have
-- several rows across their phone and iPad.
--
-- Requires 0001_lifeos_members.sql.

create table if not exists public.lifeos_devices (
  token text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  platform text not null default 'ios',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lifeos_devices_user_idx
  on public.lifeos_devices (user_id);

alter table public.lifeos_devices enable row level security;

-- A device row is only ever the caller's own. Neither of you can enumerate the
-- other's devices, and the Edge Function reads them with the service role.
drop policy if exists "member reads own devices" on public.lifeos_devices;
create policy "member reads own devices"
on public.lifeos_devices
for select
to authenticated
using (public.is_member() and user_id = auth.uid());

drop policy if exists "member registers own device" on public.lifeos_devices;
create policy "member registers own device"
on public.lifeos_devices
for insert
to authenticated
with check (public.is_member() and user_id = auth.uid());

drop policy if exists "member updates own device" on public.lifeos_devices;
create policy "member updates own device"
on public.lifeos_devices
for update
to authenticated
using (public.is_member() and user_id = auth.uid())
with check (public.is_member() and user_id = auth.uid());

drop policy if exists "member removes own device" on public.lifeos_devices;
create policy "member removes own device"
on public.lifeos_devices
for delete
to authenticated
using (public.is_member() and user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Outbound notification queue
-- ---------------------------------------------------------------------------
--
-- Triggers write here rather than calling APNs directly. A database
-- transaction has no business waiting on Apple, and a queue means a failed
-- send can be retried instead of vanishing.

create table if not exists public.lifeos_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  body text not null,
  data jsonb not null default '{}'::jsonb,
  sent_at timestamptz,
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now()
);

create index if not exists lifeos_notifications_pending_idx
  on public.lifeos_notifications (created_at)
  where sent_at is null;

alter table public.lifeos_notifications enable row level security;

-- Nobody reads this from the client. The Edge Function uses the service role,
-- which bypasses RLS. Enabling it with no policy is the point: default deny.

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create or replace function public.lifeos_queue_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recipient uuid;
  sender_name text;
begin
  -- The other member, whoever that is. Never notify the author of their own
  -- action.
  select m.user_id into recipient
  from public.lifeos_members m
  where m.user_id <> new.author_id
  limit 1;

  if recipient is null then
    return new;
  end if;

  select m.display_name into sender_name
  from public.lifeos_members m
  where m.user_id = new.author_id;

  if tg_table_name = 'lifeos_video_notes' then
    insert into public.lifeos_notifications (recipient_id, title, body, data)
    values (
      recipient,
      coalesce(sender_name, 'A new video note'),
      'Sent you a video note.',
      jsonb_build_object('screen', 'journal', 'id', new.id)
    );

  elsif tg_table_name = 'lifeos_prompt_answers' then
    -- Only tell them once both answers are in, otherwise the notification
    -- itself leaks that the other person has answered before the reveal.
    if exists (
      select 1 from public.lifeos_prompt_answers a
      where a.prompt_date = new.prompt_date
        and a.author_id = recipient
    ) then
      insert into public.lifeos_notifications (recipient_id, title, body, data)
      values (
        recipient,
        'Today is open',
        'You have both answered. Their answer is waiting.',
        jsonb_build_object('screen', 'prompt', 'date', new.prompt_date)
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists lifeos_video_note_notify on public.lifeos_video_notes;
create trigger lifeos_video_note_notify
after insert on public.lifeos_video_notes
for each row execute function public.lifeos_queue_notification();

drop trigger if exists lifeos_prompt_answer_notify on public.lifeos_prompt_answers;
create trigger lifeos_prompt_answer_notify
after insert on public.lifeos_prompt_answers
for each row execute function public.lifeos_queue_notification();
