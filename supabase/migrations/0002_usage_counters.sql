-- Server-side upload allowance.
--
-- The client already counts uploads (see `domain/uploadQuota.ts`), but that
-- count is a display meter: it lives in local storage the user can clear. This
-- table is the one that decides. It is written only by the `generate-deck`
-- Edge Function — the same place the OpenRouter key now lives — so the count
-- and the spend happen together and neither can be reached without the other.
--
-- Run against a project that already applied supabase/schema.sql.

create table if not exists public.usage_counters (
  user_id uuid not null references auth.users(id) on delete cascade,
  -- `YYYY-MM` in UTC, the same period key `usagePeriod()` computes on the
  -- client. A new month is a new row rather than a scheduled reset.
  period text not null,
  uploads integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, period)
);

alter table public.usage_counters enable row level security;

-- Readable by its owner, so a fresh device can show a true count instead of
-- starting the month over. There is deliberately no insert/update/delete
-- policy: only the Edge Function moves the number, and it uses the service
-- role, which bypasses RLS.
--
-- Dropped first so this file can be re-run; `create policy` has no
-- `if not exists`.
drop policy if exists "usage is self-readable" on public.usage_counters;
create policy "usage is self-readable" on public.usage_counters
  for select using (user_id = auth.uid());

-- Spends one upload if the allowance has room, and reports the new count.
--
-- The check and the increment are a single statement on purpose: two
-- generations started at the same instant must not both see the last
-- remaining upload. The second one conflicts, re-reads the committed row, and
-- fails its own WHERE.
--
-- `p_limit` null means an unlimited plan — still counted, never blocked.
-- Returns the new count, or null when the allowance is already spent.
create or replace function public.spend_upload(p_user uuid, p_period text, p_limit integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare spent integer;
begin
  if p_limit is not null and p_limit <= 0 then
    return null;
  end if;

  insert into public.usage_counters as u (user_id, period, uploads)
  values (p_user, p_period, 1)
  on conflict (user_id, period) do update
    set uploads = u.uploads + 1, updated_at = now()
    where p_limit is null or u.uploads < p_limit
  returning u.uploads into spent;

  return spent;
end;
$$;

-- Puts an upload back when the call it was reserved for never reached the
-- model. Floors at zero so a double refund cannot mint allowance.
create or replace function public.refund_upload(p_user uuid, p_period text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.usage_counters
    set uploads = greatest(0, uploads - 1), updated_at = now()
  where user_id = p_user and period = p_period;
end;
$$;

-- Both functions are security definer and take the user id as an argument, so
-- leaving the default grant in place would let any signed-in client spend or
-- refund against any account. Only the service role — i.e. the Edge Function —
-- may call them.
revoke execute on function public.spend_upload(uuid, text, integer) from public;
revoke execute on function public.refund_upload(uuid, text) from public;
grant execute on function public.spend_upload(uuid, text, integer) to service_role;
grant execute on function public.refund_upload(uuid, text) to service_role;
