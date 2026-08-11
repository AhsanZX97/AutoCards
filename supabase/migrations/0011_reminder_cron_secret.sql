-- Gives the reminder sweep a secret nobody has to carry.
--
-- Supersedes the arrangement in 0010, which expected both the endpoint and the
-- shared secret to be put into Vault by hand. That was two manual steps on
-- every project, and the secret had to exist in two places at once — Vault and
-- the function's environment — which is two places for it to leak from and two
-- to keep in step.
--
-- Instead: the database generates the secret itself and never hands it out.
-- `cron` reads it from Vault to make the call, and `send-reminders` checks a
-- candidate against it through `verify_reminder_cron_secret` below, which
-- answers yes or no and never returns the value. Nothing has to be copied
-- anywhere, and nothing sensitive is in this repository.

-- Two v4 UUIDs stripped of their dashes: 64 hex characters, 256 bits, from the
-- same CSPRNG `gen_random_bytes` would have used. Built in since Postgres 13,
-- so this needs no extension and cannot land in the wrong schema.
--
-- Generated once. Re-running this file never rotates it — that would silently
-- lock out a deployed function until someone noticed.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'reminders_cron_secret') then
    perform vault.create_secret(
      replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
      'reminders_cron_secret'
    );
  end if;
end
$$;

-- The endpoint is not a secret — the same project URL is compiled into the web
-- bundle for anyone to read — so it is written plainly here rather than kept in
-- Vault. A different project needs this one line changed.
create or replace function public.run_reminder_sweep() returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  secret text;
begin
  select decrypted_secret into secret
    from vault.decrypted_secrets where name = 'reminders_cron_secret';

  if secret is null then
    raise warning 'reminder sweep skipped: reminders_cron_secret is not in the vault';
    return;
  end if;

  -- Fire and forget. pg_net queues the request and returns immediately, so a
  -- slow or unreachable function cannot hold a cron worker open.
  perform net.http_post(
    url := 'https://aiqoojayjueqrgpnaqkl.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
end;
$$;

revoke all on function public.run_reminder_sweep() from public, anon, authenticated;

/**
 * Does this candidate match the cron secret?
 *
 * The only way anything outside the database learns anything about that
 * secret, and all it learns is one bit. `send-reminders` calls this with
 * whatever arrived in the `x-cron-secret` header.
 */
create or replace function public.verify_reminder_cron_secret(candidate text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  secret text;
begin
  if candidate is null or candidate = '' then
    return false;
  end if;
  select decrypted_secret into secret
    from vault.decrypted_secrets where name = 'reminders_cron_secret';
  return secret is not null and candidate = secret;
end;
$$;

-- Reachable only by the service role, which is to say only from a function
-- holding the project's secret key. Left open to `authenticated`, every
-- signed-in learner would have an oracle to guess the secret against.
revoke all on function public.verify_reminder_cron_secret(text) from public, anon, authenticated;
grant execute on function public.verify_reminder_cron_secret(text) to service_role;
