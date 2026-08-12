-- Makes the upload allowance survive account deletion.
--
-- `usage_counters` (0002) is keyed by `user_id` and cascades away the instant
-- `delete-account` deletes the auth user. Without something that outlives
-- that row, deleting an account and signing back up with the same email is a
-- free reset of the monthly allowance. This table is that something: keyed
-- by a hash of the email rather than the account id, with no foreign key to
-- `auth.users`, so nothing about it is touched by the cascade.
--
-- The email itself is not stored — only `sha256(lower(email))` — so the
-- ledger can still recognise a returning email without keeping the plaintext
-- address around after someone has deleted their account.
create table public.usage_by_email (
  email_hash text not null,
  period text not null,
  uploads integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (email_hash, period)
);

alter table public.usage_by_email enable row level security;
-- No policies at all: this is never read on anyone's behalf, only spent
-- and refunded by the Edge Function via the service role, which bypasses
-- RLS. Nobody — not even the account it describes — can read it directly.

-- Carries forward whatever the current month's accounts have already spent,
-- so this migration cannot itself be used as a reset: deploying it and
-- immediately deleting an account must not hand back uploads already used.
insert into public.usage_by_email (email_hash, period, uploads)
select
  encode(sha256(convert_to(lower(u.email), 'UTF8')), 'hex'),
  uc.period,
  uc.uploads
from public.usage_counters uc
join auth.users u on u.id = uc.user_id
where u.email is not null
on conflict (email_hash, period) do update
  set uploads = greatest(public.usage_by_email.uploads, excluded.uploads),
      updated_at = now();

-- Both functions gain a `p_email` argument, which changes their signature,
-- so the old ones have to be dropped rather than replaced.
drop function if exists public.spend_upload(uuid, text, integer);
drop function if exists public.refund_upload(uuid, text);

-- Same contract as before — check and increment in one statement, `p_limit`
-- null meaning unlimited, null return meaning nothing was left — except the
-- allowance now lives on the email hash. `usage_counters` is still written
-- alongside it, kept equal to the email ledger's count, purely so the
-- per-account read in `SupabaseAccountBackend.fetchUploadUsage` keeps working
-- unchanged: a brand new account whose email already spent this month's
-- allowance sees that reflected immediately rather than starting at zero.
--
-- An email is not required to exist by anything upstream of this function,
-- so a missing one falls back to a per-user key rather than colliding every
-- email-less caller into one shared bucket.
create or replace function public.spend_upload(p_user uuid, p_email text, p_period text, p_limit integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text := encode(
    sha256(convert_to(lower(coalesce(p_email, 'user:' || p_user::text)), 'UTF8')),
    'hex'
  );
  spent integer;
begin
  if p_limit is not null and p_limit <= 0 then
    return null;
  end if;

  insert into public.usage_by_email as e (email_hash, period, uploads)
  values (v_hash, p_period, 1)
  on conflict (email_hash, period) do update
    set uploads = e.uploads + 1, updated_at = now()
    where p_limit is null or e.uploads < p_limit
  returning e.uploads into spent;

  if spent is null then
    return null;
  end if;

  insert into public.usage_counters as u (user_id, period, uploads)
  values (p_user, p_period, spent)
  on conflict (user_id, period) do update
    set uploads = spent, updated_at = now();

  return spent;
end;
$$;

-- Mirrors spend_upload: refunds the email ledger first, then mirrors its
-- result onto usage_counters so the two never disagree.
create or replace function public.refund_upload(p_user uuid, p_email text, p_period text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text := encode(
    sha256(convert_to(lower(coalesce(p_email, 'user:' || p_user::text)), 'UTF8')),
    'hex'
  );
  new_count integer;
begin
  update public.usage_by_email
    set uploads = greatest(0, uploads - 1), updated_at = now()
  where email_hash = v_hash and period = p_period
  returning uploads into new_count;

  update public.usage_counters
    set uploads = coalesce(new_count, greatest(0, uploads - 1)), updated_at = now()
  where user_id = p_user and period = p_period;
end;
$$;

revoke execute on function public.spend_upload(uuid, text, text, integer) from public;
revoke execute on function public.refund_upload(uuid, text, text) from public;
grant execute on function public.spend_upload(uuid, text, text, integer) to service_role;
grant execute on function public.refund_upload(uuid, text, text) to service_role;
