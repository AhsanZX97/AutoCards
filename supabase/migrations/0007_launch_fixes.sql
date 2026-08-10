-- Three corrections found in the pre-launch review.
--
-- Run against a project that already applied supabase/schema.sql and 0001-0006.

-- 1. The Stripe customer, remembered as soon as one exists.
--
-- Until now the customer id was only recorded when a payment landed and the
-- webhook wrote a `subscriptions` row. Someone who opened checkout and closed
-- the tab left nothing behind, so the next attempt made a *second* Stripe
-- customer, and the one after that a third. Recording it on the profile at
-- checkout time makes the first customer the only one.
--
-- Server-written, like `plan` and `is_admin`: the column grants from 0005 hand
-- the client only `username` and `avatar_url`, and a table-level grant covers
-- columns added later, so the service role already reaches this one.
alter table public.profiles add column if not exists stripe_customer_id text;

-- The webhook resolves a customer back to an account through this when there
-- is no subscription row yet.
create unique index if not exists profiles_stripe_customer_uidx
  on public.profiles (stripe_customer_id)
  where stripe_customer_id is not null;

-- 2. When Stripe says the applied event happened.
--
-- Stripe guarantees delivery, not order: an update delayed by a retry can
-- arrive after a newer one. Claiming each event id stops a *redelivery* being
-- applied twice, but says nothing about sequence — so an out-of-order arrival
-- would roll an account back to a state it has already left. Recording the
-- event's own timestamp is what lets the next one be recognised as older.
--
-- Nullable, and read as "apply it" when absent: an event that cannot be dated
-- must still land, because dropping it would leave someone who paid on free.
alter table public.subscriptions add column if not exists last_event_at timestamptz;

-- 3. A cascaded card tombstone has to move its row's `updated_at` too.
--
-- Pulls page through `updated_at`, so setting `deleted_at` alone wrote a
-- tombstone that no incremental pull could ever see. It has been masked by the
-- deck's own tombstone clearing the cards client-side, but that makes the card
-- rows unable to carry their own deletion — and anything that syncs cards
-- without their deck would silently keep them.
--
-- Aligned to the deck's timestamp rather than now(), so the card and the deck
-- that deleted it agree on when it happened. `enforce_deck_tombstone` compares
-- the two with a strict `>`, so an equal pair passes through untouched.
create or replace function public.cascade_deck_delete() returns trigger
language plpgsql as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    update public.cards
      set deleted_at = new.deleted_at, updated_at = new.deleted_at
    where deck_id = new.id and deleted_at is null;
  end if;
  return new;
end;
$$;
