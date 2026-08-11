-- Wakes `send-reminders` on a schedule, which is the whole reason the reminder
-- rows are in Postgres rather than in a browser.
--
-- Nothing project-specific is written here. The endpoint and the shared secret
-- both live in Vault, because a migration is committed to the repository and
-- neither of those should be. Set them once per project:
--
--   select vault.create_secret('https://<ref>.supabase.co/functions/v1/send-reminders',
--                              'reminders_endpoint');
--   select vault.create_secret('<the REMINDERS_CRON_SECRET value>',
--                              'reminders_cron_secret');
--
-- Until both exist the sweep is a no-op that warns, rather than an error that
-- fills the cron log — a project restored from these migrations without its
-- secrets should be quiet, not broken.

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.run_reminder_sweep() returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  endpoint text;
  secret text;
begin
  select decrypted_secret into endpoint
    from vault.decrypted_secrets where name = 'reminders_endpoint';
  select decrypted_secret into secret
    from vault.decrypted_secrets where name = 'reminders_cron_secret';

  if endpoint is null or secret is null then
    raise warning 'reminder sweep skipped: reminders_endpoint or reminders_cron_secret is not in the vault';
    return;
  end if;

  -- Fire and forget. pg_net queues the request and returns immediately, so a
  -- slow or unreachable function cannot hold a cron worker open.
  perform net.http_post(
    url := endpoint,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
end;
$$;

-- Nobody but the scheduler should be able to make this call, and
-- `security definer` means it runs with the owner's reach into the vault.
revoke all on function public.run_reminder_sweep() from public, anon, authenticated;

-- Every five minutes rather than hourly: the send time is chosen to the
-- minute, and a reminder set for 6pm that arrives at 6:59 is a reminder for a
-- study session that already did not happen. Runs that find nothing cost one
-- indexed lookup and no invocation of anything else.
select cron.unschedule('send-study-reminders')
  where exists (select 1 from cron.job where jobname = 'send-study-reminders');

select cron.schedule(
  'send-study-reminders',
  '*/5 * * * *',
  $$select public.run_reminder_sweep()$$
);
