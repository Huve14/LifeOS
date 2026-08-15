-- 0015_automations.sql
--
-- Owner-private automation settings and cached briefs, plus shared read-only
-- South African calendar/toolkit reference data. Delivery rows are consumed
-- by the existing lifeos_notifications queue; this migration deliberately
-- does not create a second push system.

create table if not exists public.lifeos_automation_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  price_watch_alerts boolean not null default true,
  fx_alerts boolean not null default false,
  fx_target numeric(12,4),
  fx_direction text not null default 'above' check (fx_direction in ('above', 'below')),
  weekly_deals_digest boolean not null default true,
  event_reminders boolean not null default true,
  newcomer_buddy boolean not null default false,
  last_fx_notified_at timestamptz,
  last_digest_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (fx_target is null or fx_target > 0)
);

create table if not exists public.lifeos_arrival_tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  task_key text not null,
  title text not null check (char_length(btrim(title)) between 1 and 180),
  detail text not null default '' check (char_length(detail) <= 1200),
  due_on date,
  status text not null default 'pending' check (status in ('pending', 'done', 'not_needed')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, task_key)
);

create index if not exists lifeos_arrival_tasks_owner_due_idx
  on public.lifeos_arrival_tasks (owner_id, status, due_on);

create table if not exists public.lifeos_daily_briefs (
  user_id uuid not null references auth.users (id) on delete cascade,
  brief_date date not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, brief_date)
);

-- Service-only deduplication ledger. RLS is enabled with no client policy.
create table if not exists public.lifeos_automation_deliveries (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users (id) on delete cascade,
  automation_key text not null,
  period_key text not null,
  created_at timestamptz not null default now(),
  unique (recipient_id, automation_key, period_key)
);

create index if not exists lifeos_automation_deliveries_created_idx
  on public.lifeos_automation_deliveries (created_at desc);

-- A just-landed account receives a generic introduction that contains no
-- profile fields or private location details. The draft remains owner-private
-- so the member can edit the post after the automatic welcome.
create table if not exists public.lifeos_welcome_drafts (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  title text not null,
  body text not null default '',
  published_question_id uuid references public.lifeos_questions (id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lifeos_buddy_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lifeos_sa_calendar (
  slug text primary key,
  title text not null,
  starts_at timestamptz not null,
  category text not null check (category in ('heritage', 'public_holiday', 'rugby', 'cricket')),
  opponent text,
  venue text,
  source_name text not null,
  source_url text not null,
  created_at timestamptz not null default now()
);

create index if not exists lifeos_sa_calendar_starts_idx
  on public.lifeos_sa_calendar (starts_at);

create table if not exists public.lifeos_toolkit_items (
  slug text primary key,
  category text not null check (category in ('visa', 'emergency', 'embassy', 'arrival')),
  title text not null,
  summary text not null,
  steps text[] not null default '{}'::text[],
  phone text,
  url text,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.lifeos_automation_preferences enable row level security;
alter table public.lifeos_arrival_tasks enable row level security;
alter table public.lifeos_daily_briefs enable row level security;
alter table public.lifeos_automation_deliveries enable row level security;
alter table public.lifeos_welcome_drafts enable row level security;
alter table public.lifeos_buddy_preferences enable row level security;
alter table public.lifeos_sa_calendar enable row level security;
alter table public.lifeos_toolkit_items enable row level security;

revoke all on table public.lifeos_automation_preferences from public, anon, authenticated;
revoke all on table public.lifeos_arrival_tasks from public, anon, authenticated;
revoke all on table public.lifeos_daily_briefs from public, anon, authenticated;
revoke all on table public.lifeos_automation_deliveries from public, anon, authenticated;
revoke all on table public.lifeos_welcome_drafts from public, anon, authenticated;
revoke all on table public.lifeos_buddy_preferences from public, anon, authenticated;
revoke all on table public.lifeos_sa_calendar from public, anon, authenticated;
revoke all on table public.lifeos_toolkit_items from public, anon, authenticated;

grant select, insert, update, delete on table public.lifeos_automation_preferences to authenticated;
grant select, update on table public.lifeos_arrival_tasks to authenticated;
grant select on table public.lifeos_daily_briefs to authenticated;
grant select, update on table public.lifeos_welcome_drafts to authenticated;
grant select, insert, update, delete on table public.lifeos_buddy_preferences to authenticated;
grant select on table public.lifeos_sa_calendar to authenticated;
grant select on table public.lifeos_toolkit_items to authenticated;

create policy "owners manage automation preferences" on public.lifeos_automation_preferences
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owners read arrival tasks" on public.lifeos_arrival_tasks
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "owners update arrival tasks" on public.lifeos_arrival_tasks
  for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "owners read daily briefs" on public.lifeos_daily_briefs
  for select to authenticated using (user_id = (select auth.uid()));
create policy "owners read welcome drafts" on public.lifeos_welcome_drafts
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "owners update welcome drafts" on public.lifeos_welcome_drafts
  for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "owners manage buddy preference" on public.lifeos_buddy_preferences
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "members read SA calendar" on public.lifeos_sa_calendar
  for select to authenticated using ((select auth.uid()) is not null);
create policy "members read toolkit" on public.lifeos_toolkit_items
  for select to authenticated using ((select auth.uid()) is not null);

create or replace function public.lifeos_touch_automation_row()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists lifeos_automation_preferences_touch on public.lifeos_automation_preferences;
create trigger lifeos_automation_preferences_touch before update on public.lifeos_automation_preferences
  for each row execute function public.lifeos_touch_automation_row();
drop trigger if exists lifeos_arrival_tasks_touch on public.lifeos_arrival_tasks;
create trigger lifeos_arrival_tasks_touch before update on public.lifeos_arrival_tasks
  for each row execute function public.lifeos_touch_automation_row();
drop trigger if exists lifeos_welcome_drafts_touch on public.lifeos_welcome_drafts;
create trigger lifeos_welcome_drafts_touch before update on public.lifeos_welcome_drafts
  for each row execute function public.lifeos_touch_automation_row();
drop trigger if exists lifeos_buddy_preferences_touch on public.lifeos_buddy_preferences;
create trigger lifeos_buddy_preferences_touch before update on public.lifeos_buddy_preferences
  for each row execute function public.lifeos_touch_automation_row();

create or replace function public.lifeos_seed_arrival_automation()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  anchor date;
  delivery uuid;
  welcome_question uuid;
begin
  insert into public.lifeos_automation_preferences (user_id)
  values (new.user_id) on conflict (user_id) do nothing;
  insert into public.lifeos_buddy_preferences (user_id)
  values (new.user_id) on conflict (user_id) do nothing;

  anchor := coalesce(new.arrived_on, current_date);
  if new.status in ('landing_soon', 'just_landed') then
    insert into public.lifeos_arrival_tasks (owner_id, task_key, title, detail, due_on)
    values
      (new.user_id, 'medical_fitness', 'Book your medical fitness screening', 'Required timelines depend on your visa route. Keep the appointment result with your private documents.', anchor + 30),
      (new.user_id, 'emirates_id', 'Follow up on your Emirates ID', 'Track biometrics and application status after your residence visa step.', anchor + 35),
      (new.user_id, 'driving_licence', 'Check your driving licence conversion', 'Confirm the current Abu Dhabi eligibility and required eye test before the date.', anchor + 90)
    on conflict (owner_id, task_key) do update set
      due_on = excluded.due_on,
      detail = excluded.detail,
      updated_at = now();
  end if;

  if new.status = 'just_landed' then
    insert into public.lifeos_welcome_drafts (owner_id, title, body)
    values (
      new.user_id,
      'Hello from a new South African in Abu Dhabi',
      'I have just landed and would love to meet the community and learn the local shortcuts that make daily life easier.'
    ) on conflict (owner_id) do nothing;

    -- "Just landed" is an explicit registration choice. Post the generic
    -- welcome once and store its id so later profile edits cannot duplicate it.
    select published_question_id into welcome_question
    from public.lifeos_welcome_drafts
    where owner_id = new.user_id
    for update;
    if welcome_question is null then
      insert into public.lifeos_questions (author_id, title, body)
      values (
        new.user_id,
        'Hello from a new South African in Abu Dhabi',
        'I have just landed and would love to meet the community and learn the local shortcuts that make daily life easier.'
      ) returning id into welcome_question;
      update public.lifeos_welcome_drafts
      set published_question_id = welcome_question, published_at = now(), updated_at = now()
      where owner_id = new.user_id;
    end if;

    insert into public.lifeos_automation_deliveries (recipient_id, automation_key, period_key)
    values (new.user_id, 'arrival_welcome', 'first')
    on conflict do nothing returning id into delivery;
    if delivery is not null then
      insert into public.lifeos_notifications (recipient_id, title, body, data)
      values (
        new.user_id,
        'Welcome to Abu Dhabi',
        'Your arrival checklist and offline essentials are ready.',
        jsonb_build_object('screen', 'toolkit')
      );
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists lifeos_profile_arrival_automation on public.lifeos_profiles;
create trigger lifeos_profile_arrival_automation
after insert or update of status, arrived_on on public.lifeos_profiles
for each row execute function public.lifeos_seed_arrival_automation();

create or replace function public.lifeos_publish_welcome_intro()
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  draft public.lifeos_welcome_drafts;
  question_id uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select * into draft from public.lifeos_welcome_drafts
  where owner_id = auth.uid() for update;
  if draft.owner_id is null then raise exception 'No welcome draft is waiting'; end if;
  if draft.published_question_id is not null then return draft.published_question_id; end if;
  insert into public.lifeos_questions (author_id, title, body)
  values (auth.uid(), draft.title, draft.body) returning id into question_id;
  update public.lifeos_welcome_drafts
  set published_question_id = question_id, published_at = now(), updated_at = now()
  where owner_id = auth.uid();
  return question_id;
end;
$$;

create or replace function public.lifeos_find_newcomer_buddy()
returns table (user_id uuid, display_name text, home_town text, emirate text)
language sql stable security definer set search_path = ''
as $$
  select profile.user_id, profile.display_name, profile.home_town, profile.emirate
  from public.lifeos_profiles me
  join public.lifeos_buddy_preferences mine on mine.user_id = me.user_id and mine.enabled
  join public.lifeos_profiles profile
    on lower(btrim(profile.home_town)) = lower(btrim(me.home_town))
   and profile.user_id <> me.user_id
   and profile.visible_in_directory
   and profile.arrived_on <= current_date - 365
  join public.lifeos_buddy_preferences theirs on theirs.user_id = profile.user_id and theirs.enabled
  where me.user_id = auth.uid() and nullif(btrim(me.home_town), '') is not null
  order by profile.arrived_on, profile.user_id
  limit 1;
$$;

revoke all on function public.lifeos_publish_welcome_intro() from public, anon;
revoke all on function public.lifeos_find_newcomer_buddy() from public, anon;
grant execute on function public.lifeos_publish_welcome_intro() to authenticated;
grant execute on function public.lifeos_find_newcomer_buddy() to authenticated;

insert into public.lifeos_automation_preferences (user_id)
select id from auth.users on conflict (user_id) do nothing;
insert into public.lifeos_buddy_preferences (user_id)
select id from auth.users on conflict (user_id) do nothing;

insert into public.lifeos_arrival_tasks (owner_id, task_key, title, detail, due_on)
select profile.user_id, task.task_key, task.title, task.detail, coalesce(profile.arrived_on, current_date) + task.days_after
from public.lifeos_profiles profile
cross join (values
  ('medical_fitness', 'Book your medical fitness screening', 'Required timelines depend on your visa route. Keep the appointment result with your private documents.', 30),
  ('emirates_id', 'Follow up on your Emirates ID', 'Track biometrics and application status after your residence visa step.', 35),
  ('driving_licence', 'Check your driving licence conversion', 'Confirm the current Abu Dhabi eligibility and required eye test before the date.', 90)
) as task(task_key, title, detail, days_after)
where profile.status in ('landing_soon', 'just_landed')
on conflict (owner_id, task_key) do nothing;

insert into public.lifeos_welcome_drafts (owner_id, title, body)
select user_id, 'Hello from a new South African in Abu Dhabi',
       'I have just landed and would love to meet the community and learn the local shortcuts that make daily life easier.'
from public.lifeos_profiles where status = 'just_landed'
on conflict (owner_id) do nothing;

insert into public.lifeos_sa_calendar (slug, title, starts_at, category, opponent, venue, source_name, source_url)
values
  ('springboks-nz-2026-08-22', 'Springboks v New Zealand', '2026-08-22 15:10:00+02', 'rugby', 'New Zealand', 'Ellis Park, Johannesburg', 'SA Rugby', 'https://springboks.rugby/match-centre/'),
  ('springboks-nz-2026-08-29', 'Springboks v New Zealand', '2026-08-29 17:10:00+02', 'rugby', 'New Zealand', 'DHL Stadium, Cape Town', 'SA Rugby', 'https://springboks.rugby/match-centre/'),
  ('springboks-nz-2026-09-05', 'Springboks v New Zealand', '2026-09-05 17:10:00+02', 'rugby', 'New Zealand', 'FNB Stadium, Johannesburg', 'SA Rugby', 'https://springboks.rugby/match-centre/'),
  ('springboks-nz-2026-09-12', 'Springboks v New Zealand', '2026-09-12 17:00:00+00', 'rugby', 'New Zealand', 'International venue', 'SA Rugby', 'https://springboks.rugby/match-centre/'),
  ('heritage-day-2026', 'Heritage Day', '2026-09-24 00:00:00+02', 'heritage', null, 'South Africa', 'South African Government', 'https://www.gov.za/about-sa/public-holidays'),
  ('proteas-aus-odi-1-2026', 'Proteas v Australia · 1st ODI', '2026-09-24 10:00:00+02', 'cricket', 'Australia', 'Kingsmead, Durban', 'Cricket South Africa', 'https://cricket.co.za/upcoming/'),
  ('proteas-aus-odi-2-2026', 'Proteas v Australia · 2nd ODI', '2026-09-27 10:00:00+02', 'cricket', 'Australia', 'Wanderers, Johannesburg', 'Cricket South Africa', 'https://cricket.co.za/upcoming/'),
  ('proteas-aus-odi-3-2026', 'Proteas v Australia · 3rd ODI', '2026-09-30 13:30:00+02', 'cricket', 'Australia', 'JB Marks Oval, Potchefstroom', 'Cricket South Africa', 'https://cricket.co.za/upcoming/'),
  ('reconciliation-day-2026', 'Day of Reconciliation', '2026-12-16 00:00:00+02', 'public_holiday', null, 'South Africa', 'South African Government', 'https://www.gov.za/about-sa/public-holidays'),
  ('freedom-day-2027', 'Freedom Day', '2027-04-27 00:00:00+02', 'public_holiday', null, 'South Africa', 'South African Government', 'https://www.gov.za/about-sa/public-holidays'),
  ('youth-day-2027', 'Youth Day', '2027-06-16 00:00:00+02', 'public_holiday', null, 'South Africa', 'South African Government', 'https://www.gov.za/about-sa/public-holidays')
on conflict (slug) do update set
  title = excluded.title, starts_at = excluded.starts_at, opponent = excluded.opponent,
  venue = excluded.venue, source_name = excluded.source_name, source_url = excluded.source_url;

insert into public.lifeos_toolkit_items (slug, category, title, summary, steps, phone, url, sort_order)
values
  ('uae-emergency', 'emergency', 'UAE emergency numbers', 'Keep these available without signal.', array['Police: 999', 'Ambulance: 998', 'Fire: 997', 'Save your insurer and building security numbers too.'], '999', 'https://u.ae/en/information-and-services/justice-safety-and-the-law/handling-emergencies', 10),
  ('sa-embassy', 'embassy', 'South African Embassy · Abu Dhabi', 'Consular help for South African citizens in the UAE.', array['Check the official page before travelling.', 'Keep a copy of your passport and UAE residence details.', 'Use emergency numbers first for immediate danger.'], null, 'https://dirco.gov.za/abu-dhabi/', 20),
  ('residence-visa', 'visa', 'Residence visa essentials', 'A calm checklist for the usual residence process.', array['Keep entry permit and passport copies private.', 'Complete the required medical fitness step.', 'Follow biometrics and Emirates ID status.', 'Confirm exact requirements with ICP or your sponsor.'], null, 'https://icp.gov.ae/', 30),
  ('emirates-id', 'visa', 'Emirates ID follow-up', 'Track biometrics, delivery and the digital ID copy.', array['Keep the application number.', 'Check status through ICP.', 'Update banks and services after receiving it.'], null, 'https://icp.gov.ae/', 40),
  ('first-48-hours', 'arrival', 'Your first 48 hours', 'The practical minimum for a calm landing.', array['Get a working SIM or eSIM.', 'Save home and work in Maps.', 'Stock water, simple food and medication.', 'Tell someone you arrived safely.'], null, null, 50)
on conflict (slug) do update set
  title = excluded.title, summary = excluded.summary, steps = excluded.steps,
  phone = excluded.phone, url = excluded.url, sort_order = excluded.sort_order;

-- Existing watches gain no client-visible secret; this timestamp already
-- existed and is enough for the daily worker to avoid repeating one reading.
