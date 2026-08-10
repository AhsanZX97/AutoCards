-- Replaces the `team` tier with `lifetime`.
--
-- `team` was never on sale: it had no Stripe price, so nothing could reach it
-- except an admin comp. It is renamed rather than dropped so that if anyone
-- was comped onto it, they keep the unlimited allowance they were given
-- instead of silently falling back to free.
--
-- The check constraints have to be widened before the data moves and narrowed
-- after, so the rows are never briefly in violation of either shape.

alter table public.profiles drop constraint if exists profiles_plan_check;
alter table public.subscriptions drop constraint if exists subscriptions_plan_check;

update public.profiles set plan = 'lifetime' where plan = 'team';
update public.subscriptions set plan = 'lifetime' where plan = 'team';

alter table public.profiles
  add constraint profiles_plan_check check (plan in ('free','pro','lifetime'));
alter table public.subscriptions
  add constraint subscriptions_plan_check check (plan in ('free','pro','lifetime'));

-- The comp path knows the plan names too, so it moves with them. Replaced
-- whole rather than patched — see 0005 for why this function is the only way
-- a plan changes by hand.
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
  if p_plan not in ('free', 'pro', 'lifetime') then
    raise exception 'Unknown plan: %', p_plan;
  end if;
  update public.profiles set plan = p_plan where id = p_user;
end;
$$;

revoke execute on function public.admin_set_plan(uuid, text) from public;
grant execute on function public.admin_set_plan(uuid, text) to authenticated;
