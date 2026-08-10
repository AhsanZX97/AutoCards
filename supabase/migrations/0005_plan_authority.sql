-- Who is allowed to change a plan.
--
-- Until now: anybody. `profiles` is updatable by its owner, and Postgres grants
-- UPDATE on every column of it, so one line in a browser console —
--
--   supabase.from('profiles').update({ plan: 'team' }).eq('id', myId)
--
-- bought an unlimited allowance for nothing. The admin check that looked like
-- it guarded this runs in the client, where it hides a button and stops no
-- requests.
--
-- Everything built on `profiles.plan` — the monthly upload allowance the
-- generate-deck function enforces, the deck limit, the plan the Stripe webhook
-- writes back — assumed that column belonged to the server. This makes it so.
--
-- Run against a project that already applied supabase/schema.sql.

-- 1. The client may write its own display name and picture. Nothing else.
--    RLS decides which *row* you may touch; column grants decide which
--    *fields*, and only the two together close this.
revoke update on public.profiles from anon, authenticated;
grant update (username, avatar_url) on public.profiles to authenticated;

-- The webhook and the Edge Functions write `plan` as the service role, which
-- is granted separately and unaffected by the revoke above. Stated explicitly
-- so it survives anyone re-reading this file and tightening it further.
grant update on public.profiles to service_role;

-- 2. An admin flag that means something, replacing a hardcoded username in the
--    client. It lives behind the same grant as `plan`, so nobody can award it
--    to themselves.
alter table public.profiles add column if not exists is_admin boolean not null default false;

-- 3. The comp path: still available, now with actual authority behind it.
--
-- Granted to every signed-in user because the function itself does the
-- checking — that is the point of security definer. A non-admin calling it
-- gets an exception rather than a plan.
create or replace function public.admin_set_plan(p_user uuid, p_plan text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce((select is_admin from public.profiles where id = auth.uid()), false) then
    raise exception 'Only an administrator can change a plan';
  end if;
  if p_plan not in ('free', 'pro', 'team') then
    raise exception 'Unknown plan: %', p_plan;
  end if;

  -- Deliberately not touching `subscriptions`: a comped plan and a paid one
  -- are different things, and the next Stripe event for this account should
  -- still win. Comping is for support and testing, not for faking a customer.
  update public.profiles set plan = p_plan where id = p_user;
end;
$$;

revoke execute on function public.admin_set_plan(uuid, text) from public;
grant execute on function public.admin_set_plan(uuid, text) to authenticated;

-- 4. Bootstrap. There is no way to grant the first admin from inside the app,
--    which is the whole idea — run this once by hand, with your own handle:
--
--   update public.profiles set is_admin = true where username = 'ahsandegreat';
