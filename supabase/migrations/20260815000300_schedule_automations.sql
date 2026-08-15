-- Schedule the server-side Life OS automation runner without placing a secret
-- in source control. Supabase production supplies pg_cron, pg_net and Vault;
-- the guarded blocks intentionally no-op in the lightweight local verifier.

create table if not exists public.lifeos_automation_cron_tokens (
  id boolean primary key default true check (id),
  secret_digest text not null check (secret_digest ~ '^[0-9a-f]{64}$'),
  updated_at timestamptz not null default now()
);

alter table public.lifeos_automation_cron_tokens enable row level security;
revoke all on table public.lifeos_automation_cron_tokens from public, anon, authenticated;
grant select on table public.lifeos_automation_cron_tokens to service_role;

do $extensions$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net')
     and not exists (select 1 from pg_extension where extname = 'pg_net') then
    execute 'create extension pg_net with schema extensions';
  end if;
exception when others then
  raise notice 'pg_net unavailable in this environment: %', sqlerrm;
end
$extensions$;

do $extensions$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
     and not exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute 'create extension pg_cron with schema pg_catalog';
  end if;
exception when others then
  raise notice 'pg_cron unavailable in this environment: %', sqlerrm;
end
$extensions$;

do $schedule$
declare
  generated_secret text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  secret_name constant text := 'lifeos_automations_cron_secret';
  job_name constant text := 'lifeos-automations-hourly';
  job_command text;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_net')
     or not exists (select 1 from pg_extension where extname = 'pg_cron')
     or to_regclass('vault.secrets') is null then
    raise notice 'Automation scheduling skipped because pg_net, pg_cron or Vault is unavailable.';
    return;
  end if;

  insert into public.lifeos_automation_cron_tokens (id, secret_digest, updated_at)
  values (true, encode(sha256(generated_secret::bytea), 'hex'), now())
  on conflict (id) do update
    set secret_digest = excluded.secret_digest,
        updated_at = excluded.updated_at;

  if exists (select 1 from vault.secrets where name = secret_name) then
    perform vault.update_secret(
      (select id from vault.secrets where name = secret_name),
      generated_secret,
      secret_name,
      'Life OS hourly automation runner'
    );
  else
    perform vault.create_secret(
      generated_secret,
      secret_name,
      'Life OS hourly automation runner'
    );
  end if;

  job_command := $job$
    select net.http_post(
      url := 'https://snpgmoedtkstbcpbtpcc.supabase.co/functions/v1/automations',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'lifeos_automations_cron_secret'
        )
      ),
      body := '{"action":"run"}'::jsonb
    );
  $job$;

  perform cron.unschedule(jobid)
  from cron.job
  where jobname = job_name;

  perform cron.schedule(job_name, '7 * * * *', job_command);
end
$schedule$;
