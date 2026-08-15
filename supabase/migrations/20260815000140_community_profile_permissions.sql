-- Later private-account migrations intentionally narrowed profile grants.
-- Restore only the Phase 2 opt-in profile fields after the full chain runs.
grant update (
  home_town, emirate, arrived_on, status, interests,
  visible_in_directory, employer_name
) on table public.lifeos_profiles to authenticated;

-- The latest private-account signup trigger pre-dated spaces and therefore
-- stopped provisioning a space. Community membership depends on every
-- account having one, so reconcile existing accounts and keep that invariant
-- for future signups while retaining private state and AI-profile setup.
do $$
declare
  account record;
  account_space uuid;
begin
  for account in select id from auth.users loop
    if not exists (
      select 1 from public.lifeos_space_members member where member.user_id = account.id
    ) then
      insert into public.lifeos_spaces (created_by) values (account.id) returning id into account_space;
      insert into public.lifeos_space_members (space_id, user_id) values (account_space, account.id);
    end if;
  end loop;
end;
$$;

create or replace function public.lifeos_handle_new_user()
returns trigger
language plpgsql security definer
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
  new_time_zone := coalesce(nullif(btrim(new.raw_user_meta_data ->> 'time_zone'), ''), 'UTC');
  new_ai_profile := case
    when jsonb_typeof(new.raw_user_meta_data -> 'ai_profile') = 'object'
      then new.raw_user_meta_data -> 'ai_profile'
    else '{}'::jsonb
  end;

  insert into public.lifeos_profiles (
    user_id, display_name, handle, time_zone, ai_profile,
    home_town, emirate, arrived_on, status, interests, visible_in_directory, employer_name
  ) values (
    new.id,
    new_name,
    public.lifeos_make_handle(new_name, new.id),
    left(new_time_zone, 80),
    new_ai_profile,
    nullif(btrim(new.raw_user_meta_data ->> 'home_town'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'emirate'), ''),
    nullif(new.raw_user_meta_data ->> 'arrived_on', '')::date,
    case when new.raw_user_meta_data ->> 'status' in ('landing_soon', 'just_landed', 'settled')
      then new.raw_user_meta_data ->> 'status' else null end,
    case when jsonb_typeof(new.raw_user_meta_data -> 'interests') = 'array'
      then array(select jsonb_array_elements_text(new.raw_user_meta_data -> 'interests'))
      else '{}'::text[] end,
    coalesce((new.raw_user_meta_data ->> 'visible_in_directory')::boolean, false),
    nullif(btrim(new.raw_user_meta_data ->> 'employer_name'), '')
  )
  on conflict (user_id) do update set
    display_name = case when public.lifeos_profiles.display_name = '' then excluded.display_name else public.lifeos_profiles.display_name end,
    time_zone = case when public.lifeos_profiles.time_zone in ('', 'UTC') then excluded.time_zone else public.lifeos_profiles.time_zone end,
    ai_profile = case when public.lifeos_profiles.ai_profile = '{}'::jsonb then excluded.ai_profile else public.lifeos_profiles.ai_profile end;

  insert into public.lifeos_user_state (user_id) values (new.id) on conflict (user_id) do nothing;

  select member.space_id into new_space
  from public.lifeos_space_members member where member.user_id = new.id limit 1;
  if new_space is null then
    insert into public.lifeos_spaces (created_by) values (new.id) returning id into new_space;
    insert into public.lifeos_space_members (space_id, user_id)
    values (new_space, new.id) on conflict do nothing;
  end if;

  return new;
end;
$$;

revoke all on function public.lifeos_handle_new_user() from public, anon, authenticated;
