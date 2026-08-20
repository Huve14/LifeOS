-- A failed optional arrival/community automation must never roll back the
-- auth.users insert. Supabase Auth reports any exception raised by this
-- trigger chain as the generic "Database error saving new user" message.
--
-- Keep the private profile and user-state rows transactional, but isolate
-- optional arrival tasks, community welcome content, notifications and space
-- membership so production schema drift in those features cannot block an
-- account from being created.

create or replace function public.lifeos_seed_arrival_automation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  anchor date;
  delivery uuid;
  welcome_question uuid;
begin
  begin
    insert into public.lifeos_automation_preferences (user_id)
    values (new.user_id)
    on conflict (user_id) do nothing;

    insert into public.lifeos_buddy_preferences (user_id)
    values (new.user_id)
    on conflict (user_id) do nothing;

    anchor := coalesce(new.arrived_on, current_date);
    if new.status in ('landing_soon', 'just_landed') then
      insert into public.lifeos_arrival_tasks (
        owner_id, task_key, title, detail, due_on
      )
      values
        (
          new.user_id,
          'medical_fitness',
          'Book your medical fitness screening',
          'Required timelines depend on your visa route. Keep the appointment result with your private documents.',
          anchor + 30
        ),
        (
          new.user_id,
          'emirates_id',
          'Follow up on your Emirates ID',
          'Track biometrics and application status after your residence visa step.',
          anchor + 35
        ),
        (
          new.user_id,
          'driving_licence',
          'Check your driving licence conversion',
          'Confirm the current Abu Dhabi eligibility and required eye test before the date.',
          anchor + 90
        )
      on conflict (owner_id, task_key) do update
      set due_on = excluded.due_on,
          detail = excluded.detail,
          updated_at = now();
    end if;

    if new.status = 'just_landed' then
      insert into public.lifeos_welcome_drafts (owner_id, title, body)
      values (
        new.user_id,
        'Hello from a new South African in Abu Dhabi',
        'I have just landed and would love to meet the community and learn the local shortcuts that make daily life easier.'
      )
      on conflict (owner_id) do nothing;

      select published_question_id
      into welcome_question
      from public.lifeos_welcome_drafts
      where owner_id = new.user_id
      for update;

      if welcome_question is null then
        insert into public.lifeos_questions (author_id, title, body)
        values (
          new.user_id,
          'Hello from a new South African in Abu Dhabi',
          'I have just landed and would love to meet the community and learn the local shortcuts that make daily life easier.'
        )
        returning id into welcome_question;

        update public.lifeos_welcome_drafts
        set published_question_id = welcome_question,
            published_at = now(),
            updated_at = now()
        where owner_id = new.user_id;
      end if;

      insert into public.lifeos_automation_deliveries (
        recipient_id, automation_key, period_key
      )
      values (new.user_id, 'arrival_welcome', 'first')
      on conflict do nothing
      returning id into delivery;

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
  exception
    when others then
      -- Optional convenience data can be rebuilt later. Do not expose profile
      -- values in logs and, critically, do not roll back the Auth user.
      raise warning 'Life OS signup automation skipped [%]: %', sqlstate, sqlerrm;
  end;

  return new;
end;
$$;

revoke all on function public.lifeos_seed_arrival_automation()
from public, anon, authenticated;
grant execute on function public.lifeos_seed_arrival_automation() to service_role;

create or replace function public.lifeos_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_name text;
  new_time_zone text;
  new_ai_profile jsonb;
  new_space uuid;
begin
  new_name := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Member'
  );
  new_time_zone := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'time_zone'), ''),
    'UTC'
  );
  new_ai_profile := case
    when jsonb_typeof(new.raw_user_meta_data -> 'ai_profile') = 'object'
      then new.raw_user_meta_data -> 'ai_profile'
    else '{}'::jsonb
  end;

  insert into public.lifeos_profiles (
    user_id, display_name, handle, time_zone, ai_profile,
    home_town, emirate, arrived_on, status, interests,
    visible_in_directory, employer_name
  )
  values (
    new.id,
    new_name,
    public.lifeos_make_handle(new_name, new.id),
    left(new_time_zone, 80),
    new_ai_profile,
    nullif(btrim(new.raw_user_meta_data ->> 'home_town'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'emirate'), ''),
    nullif(new.raw_user_meta_data ->> 'arrived_on', '')::date,
    case
      when new.raw_user_meta_data ->> 'status' in (
        'landing_soon', 'just_landed', 'settled'
      ) then new.raw_user_meta_data ->> 'status'
      else null
    end,
    case
      when jsonb_typeof(new.raw_user_meta_data -> 'interests') = 'array'
        then array(
          select jsonb_array_elements_text(
            new.raw_user_meta_data -> 'interests'
          )
        )
      else '{}'::text[]
    end,
    coalesce(
      (new.raw_user_meta_data ->> 'visible_in_directory')::boolean,
      false
    ),
    nullif(btrim(new.raw_user_meta_data ->> 'employer_name'), '')
  )
  on conflict (user_id) do update
  set display_name = case
        when public.lifeos_profiles.display_name = '' then excluded.display_name
        else public.lifeos_profiles.display_name
      end,
      time_zone = case
        when public.lifeos_profiles.time_zone in ('', 'UTC') then excluded.time_zone
        else public.lifeos_profiles.time_zone
      end,
      ai_profile = case
        when public.lifeos_profiles.ai_profile = '{}'::jsonb then excluded.ai_profile
        else public.lifeos_profiles.ai_profile
      end;

  insert into public.lifeos_user_state (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  begin
    select member.space_id
    into new_space
    from public.lifeos_space_members as member
    where member.user_id = new.id
    limit 1;

    if new_space is null then
      insert into public.lifeos_spaces (created_by)
      values (new.id)
      returning id into new_space;

      insert into public.lifeos_space_members (space_id, user_id)
      values (new_space, new.id)
      on conflict do nothing;
    end if;
  exception
    when others then
      -- Pairing/community membership is repairable and must not prevent the
      -- account, private profile, or private state from being provisioned.
      raise warning 'Life OS optional space provisioning skipped [%]: %',
        sqlstate, sqlerrm;
  end;

  return new;
end;
$$;

revoke all on function public.lifeos_handle_new_user()
from public, anon, authenticated;

drop trigger if exists lifeos_on_auth_user_created on auth.users;
create trigger lifeos_on_auth_user_created
after insert on auth.users
for each row execute function public.lifeos_handle_new_user();

comment on function public.lifeos_handle_new_user() is
  'Creates the mandatory private Life OS account rows; optional feature setup cannot abort Auth signup.';
