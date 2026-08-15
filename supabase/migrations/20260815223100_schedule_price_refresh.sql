-- Schedule the Shop & Save deal refresh.
--
-- Specials expire, so the Deals tab is only worth anything if something reads
-- the sources on a timetable. This reuses the automation runner's pattern: the
-- shared secret lives in Vault, only its digest is in a table, and the guarded
-- blocks no-op in the lightweight local verifier where pg_cron, pg_net and
-- Vault are unavailable.

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
  secret_name constant text := 'lifeos_automations_cron_secret';
  job_name constant text := 'lifeos-prices-refresh';
  job_command text;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_net')
     or not exists (select 1 from pg_extension where extname = 'pg_cron')
     or to_regclass('vault.secrets') is null then
    raise notice 'Price refresh scheduling skipped because pg_net, pg_cron or Vault is unavailable.';
    return;
  end if;

  -- Reuse the automation runner's secret so there is one rotation point. That
  -- migration creates it; if it has not run yet there is nothing to schedule.
  if not exists (select 1 from vault.secrets where name = secret_name) then
    raise notice 'Price refresh scheduling skipped because the shared cron secret does not exist yet.';
    return;
  end if;

  job_command := $job$
    select net.http_post(
      url := 'https://snpgmoedtkstbcpbtpcc.supabase.co/functions/v1/prices',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'lifeos_automations_cron_secret'
        )
      ),
      body := '{"action":"refresh-deals"}'::jsonb,
      timeout_milliseconds := 300000
    );
  $job$;

  perform cron.unschedule(jobid)
  from cron.job
  where jobname = job_name;

  -- Every six hours, offset from the hourly automation job so the two do not
  -- contend. Retailer promotions turn over in days, not minutes.
  perform cron.schedule(job_name, '23 */6 * * *', job_command);
end
$schedule$;
