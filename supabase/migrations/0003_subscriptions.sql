-- Paid plans.
--
-- `profiles.plan` stays what the app reads — every existing call site already
-- goes through it, and it is the one thing the generate-deck function checks.
-- This table is where that value comes *from*: the Stripe subscription behind
-- it, so a plan can be explained, and so a webhook arriving twice or out of
-- order can be resolved against a record rather than guessed at.
--
-- Only the `stripe-webhook` function writes here. Nothing the client sends
-- decides what someone is entitled to.
--
-- Run against a project that already applied supabase/schema.sql.

create table if not exists public.subscriptions (
  -- One subscription per account: this app sells a personal plan, and a second
  -- concurrent one would be a billing mistake rather than a feature.
  user_id uuid primary key references auth.users(id) on delete cascade,
  provider text not null default 'stripe',
  -- Stripe's customer, kept even after a subscription ends — it is how a
  -- returning customer keeps one billing history instead of collecting
  -- duplicates.
  customer_id text not null,
  subscription_id text,
  -- Stripe's own status, stored verbatim: 'active', 'trialing', 'past_due',
  -- 'canceled', 'incomplete', 'unpaid', 'paused'. Deliberately not narrowed by
  -- a check constraint — a status Stripe adds later should land in the row and
  -- be read as unentitled, not fail the webhook.
  status text not null,
  price_id text,
  -- What the price maps to, resolved at write time so reading entitlement
  -- never depends on the price list still looking the same.
  plan text not null default 'free' check (plan in ('free','pro','team')),
  current_period_end timestamptz,
  -- True once someone cancels: they keep the plan until the period ends.
  cancel_at_period_end boolean not null default false,
  updated_at timestamptz not null default now()
);

-- The webhook resolves a Stripe customer back to an account through this.
create unique index if not exists subscriptions_customer_uidx
  on public.subscriptions (customer_id);

alter table public.subscriptions enable row level security;

-- Readable by its owner so the billing screen can say what they are on and
-- when it renews. No write policy: the webhook uses the service role.
drop policy if exists "subscriptions are self-readable" on public.subscriptions;
create policy "subscriptions are self-readable" on public.subscriptions
  for select using (user_id = auth.uid());

-- Every Stripe event we have already dealt with.
--
-- Stripe retries until it gets a 2xx, and will happily deliver the same event
-- twice — on a slow reply, or on its own redelivery. Recording the id first
-- and skipping anything already present is what makes handling one idempotent.
create table if not exists public.stripe_events (
  id text primary key,
  type text not null,
  received_at timestamptz not null default now()
);

alter table public.stripe_events enable row level security;
-- No policies at all: this is bookkeeping for the webhook, not user data.

-- Records an event and reports whether it is new. False means it has been
-- handled already and the caller should stop.
create or replace function public.claim_stripe_event(p_id text, p_type text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.stripe_events (id, type) values (p_id, p_type)
  on conflict (id) do nothing;
  -- FOUND is false when the conflict swallowed the insert.
  return found;
end;
$$;

revoke execute on function public.claim_stripe_event(text, text) from public;
grant execute on function public.claim_stripe_event(text, text) to service_role;
