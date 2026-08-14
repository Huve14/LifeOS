-- Store user-supplied personalisation separately from authorization data.
-- The existing profile policy only permits auth.uid() to read or update this
-- row, and none of these values are used in RLS or access decisions.

alter table public.lifeos_profiles
  add column if not exists ai_profile jsonb not null default '{}'::jsonb
  check (jsonb_typeof(ai_profile) = 'object');

update public.lifeos_profiles as profile
set ai_profile = auth_user.raw_user_meta_data -> 'ai_profile'
from auth.users as auth_user
where profile.user_id = auth_user.id
  and profile.ai_profile = '{}'::jsonb
  and jsonb_typeof(auth_user.raw_user_meta_data -> 'ai_profile') = 'object';

create or replace function public.lifeos_handle_new_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  new_name text;
  new_time_zone text;
  new_ai_profile jsonb;
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

  insert into public.lifeos_profiles (user_id, display_name, handle, time_zone, ai_profile)
  values (
    new.id,
    new_name,
    public.lifeos_make_handle(new_name, new.id),
    left(new_time_zone, 80),
    new_ai_profile
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

  return new;
end;
$$;

revoke all on function public.lifeos_handle_new_user() from public, anon, authenticated;

grant update (ai_profile) on table public.lifeos_profiles to authenticated;

comment on column public.lifeos_profiles.ai_profile is
  'Private user-supplied facts and response preferences used to personalise Life OS AI.';
