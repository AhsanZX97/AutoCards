-- AutoCards sync schema. Run once in the Supabase SQL editor for a fresh project.
--
-- Row ids in this codebase are strings from createId() (e.g. "deck_m5x2k1..."),
-- not UUIDs, so decks.id/cards.id are `text`. Deletes are soft (deleted_at) so
-- a device that hasn't synced yet can still learn a row was removed. Deck and
-- card payloads are kept as jsonb ("data") so this schema doesn't need to
-- track every TS field as it evolves; only what sync/RLS/queries need is
-- broken out into real columns.

-- profiles: one row per auth user, created by trigger — never inserted by the client.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  avatar_url text,
  -- Written by the server only — see the column grants further down. Nothing
  -- the client sends decides what someone is entitled to.
  plan text not null default 'free' check (plan in ('free','pro','lifetime')),
  is_admin boolean not null default false,
  -- Recorded the moment a checkout is started, not when a payment lands, so a
  -- checkout somebody abandoned does not leave a second Stripe customer behind
  -- for the next attempt. Server-written like the two columns above.
  stripe_customer_id text,
  created_at timestamptz not null default now()
);

-- How the webhook resolves a Stripe customer back to an account before there
-- is any subscription row to look in.
create unique index profiles_stripe_customer_uidx
  on public.profiles (stripe_customer_id)
  where stripe_customer_id is not null;

-- Username handles are the student-facing identity. Uniqueness is enforced on
-- the lowercased value so "AlexR" and "alexr" can't both exist; sign-up/update
-- surfaces the 23505 message as "that username is taken".
create unique index profiles_username_uidx on public.profiles (lower(username));

create function public.handle_new_user() returns trigger
language plpgsql security definer as $$
begin
  insert into public.profiles (id, username)
  values (new.id, lower(coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1))));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create table public.decks (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  data jsonb not null
);

create table public.cards (
  id text primary key,
  deck_id text not null references public.decks(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  data jsonb not null
);

create index decks_owner_updated_idx on public.decks (owner_id, updated_at);
create index cards_owner_updated_idx on public.cards (owner_id, updated_at);
create index cards_deck_idx on public.cards (deck_id);

-- owner_id on cards always derives from the parent deck — the client never
-- gets to assert it directly, which also blocks attaching a card to someone
-- else's deck id.
create function public.set_card_owner() returns trigger
language plpgsql as $$
begin
  select owner_id into new.owner_id from public.decks where id = new.deck_id;
  return new;
end;
$$;
create trigger cards_owner_from_deck
  before insert or update on public.cards
  for each row execute function public.set_card_owner();

-- a deck soft-delete cascades to its cards (a plain FK cascade only fires on
-- a hard DELETE, which never happens here).
--
-- `updated_at` moves with `deleted_at`, because pulls page through
-- `updated_at` — a tombstone written without it is one no incremental pull can
-- ever see, leaving the card rows unable to carry their own deletion.
create function public.cascade_deck_delete() returns trigger
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
create trigger decks_cascade_delete
  after update on public.decks
  for each row execute function public.cascade_deck_delete();

-- a card write can't resurrect a deck that was deleted more recently than
-- the card's own edit — align the card with the deck's tombstone instead.
create function public.enforce_deck_tombstone() returns trigger
language plpgsql as $$
declare deck_deleted_at timestamptz;
begin
  select deleted_at into deck_deleted_at from public.decks where id = new.deck_id;
  if deck_deleted_at is not null and deck_deleted_at > new.updated_at then
    new.deleted_at := deck_deleted_at;
  end if;
  return new;
end;
$$;
create trigger cards_respect_deck_tombstone
  before insert or update on public.cards
  for each row execute function public.enforce_deck_tombstone();

-- study_sessions: the account's study history, and the source of every number
-- on the dashboard (streak, level/XP, accuracy, activity heatmap).
--
-- Rows are append-only. A finished run is a fact: nothing in the app edits or
-- removes one, which is why this table has no `deleted_at` and no update or
-- delete policy below. There is also no FK to decks on purpose — a summary
-- outlives the deck it came from, so deleting a deck doesn't erase the XP and
-- streak days already earned on it.
create table public.study_sessions (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  -- Server clock, not the client's `endedAt`. This is the column pulls page
  -- through, and a device flushing a run it finished offline yesterday has to
  -- land *after* cursors that have already moved past that wall-clock time.
  updated_at timestamptz not null default now(),
  data jsonb not null
);

create index study_sessions_owner_updated_idx on public.study_sessions (owner_id, updated_at);

alter table public.profiles enable row level security;
alter table public.decks enable row level security;
alter table public.cards enable row level security;
alter table public.study_sessions enable row level security;

create policy "profiles are self-readable" on public.profiles
  for select using (id = auth.uid());
create policy "profiles are self-updatable" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- RLS decides which row you may touch; column grants decide which fields, and
-- only both together stop someone awarding themselves a plan with
-- `update profiles set plan = 'lifetime'` from the browser. The client writes its
-- own name and picture; `plan` and `is_admin` belong to the server.
revoke update on public.profiles from anon, authenticated;
grant update (username, avatar_url) on public.profiles to authenticated;
grant update on public.profiles to service_role;

-- The comp path for support and testing. Security definer with its own check,
-- so it is safe to expose to every signed-in user: a non-admin gets an
-- exception rather than a plan. Grant the first admin by hand:
--   update public.profiles set is_admin = true where username = '<you>';
create function public.admin_set_plan(p_user uuid, p_plan text)
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

create policy "decks are owner-readable" on public.decks
  for select using (owner_id = auth.uid());
create policy "decks are owner-writable" on public.decks
  for insert with check (owner_id = auth.uid());
create policy "decks are owner-updatable" on public.decks
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "cards are owner-readable" on public.cards
  for select using (owner_id = auth.uid());
create policy "cards are owner-writable" on public.cards
  for insert with check (exists (select 1 from public.decks d where d.id = deck_id and d.owner_id = auth.uid()));
create policy "cards are owner-updatable" on public.cards
  for update using (owner_id = auth.uid())
  with check (exists (select 1 from public.decks d where d.id = deck_id and d.owner_id = auth.uid()));

create policy "sessions are owner-readable" on public.study_sessions
  for select using (owner_id = auth.uid());
create policy "sessions are owner-writable" on public.study_sessions
  for insert with check (owner_id = auth.uid());
-- No update policy for study_sessions: the client is given no way to rewrite
-- its own history.

-- No delete policies: the client only ever soft-deletes via UPDATE.
--
-- Pull queries must NOT filter out tombstones — a client that missed a
-- delete needs to see it to remove the row locally:
--   select * from decks where owner_id = :uid and updated_at > :since
--   select * from cards where owner_id = :uid and updated_at > :since
--   select * from study_sessions where owner_id = :uid and updated_at > :since

-- usage_counters: the monthly upload allowance, as the server sees it.
--
-- The client keeps its own count for the meter in the UI, but that one lives
-- in storage the user can clear. This is the count that decides, and only the
-- `generate-deck` Edge Function writes it — the same place the OpenRouter key
-- lives, so spending money and counting it cannot come apart.
create table public.usage_counters (
  user_id uuid not null references auth.users(id) on delete cascade,
  -- `YYYY-MM` in UTC, matching `usagePeriod()` on the client. A new month is a
  -- new row rather than a scheduled reset.
  period text not null,
  uploads integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, period)
);

alter table public.usage_counters enable row level security;

create policy "usage is self-readable" on public.usage_counters
  for select using (user_id = auth.uid());
-- No write policy: the Edge Function uses the service role, which bypasses RLS.

-- Spends one upload if the allowance has room, and reports the new count.
-- Check and increment are one statement so two generations racing for the last
-- upload cannot both win. `p_limit` null means unlimited — counted, not capped.
-- Returns the new count, or null when the allowance is spent.
create function public.spend_upload(p_user uuid, p_period text, p_limit integer)
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
create function public.refund_upload(p_user uuid, p_period text)
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

-- Both are security definer and take the user id as an argument, so the
-- default grant would let any signed-in client spend or refund against any
-- account. Only the Edge Function may call them.
revoke execute on function public.spend_upload(uuid, text, integer) from public;
revoke execute on function public.refund_upload(uuid, text) from public;
grant execute on function public.spend_upload(uuid, text, integer) to service_role;
grant execute on function public.refund_upload(uuid, text) to service_role;

-- subscriptions: the paid plan behind `profiles.plan`.
--
-- `profiles.plan` stays what the app reads. This is where that value comes
-- from — the Stripe subscription behind it — so a plan can be explained, and
-- so a webhook arriving twice or out of order resolves against a record
-- rather than a guess. Only the `stripe-webhook` function writes here.
create table public.subscriptions (
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
  plan text not null default 'free' check (plan in ('free','pro','lifetime')),
  current_period_end timestamptz,
  -- True once someone cancels: they keep the plan until the period ends.
  cancel_at_period_end boolean not null default false,
  updated_at timestamptz not null default now()
);

-- The webhook resolves a Stripe customer back to an account through this.
create unique index subscriptions_customer_uidx
  on public.subscriptions (customer_id);

alter table public.subscriptions enable row level security;

-- Readable by its owner so the billing screen can say what they are on and
-- when it renews. No write policy: the webhook uses the service role.
create policy "subscriptions are self-readable" on public.subscriptions
  for select using (user_id = auth.uid());

-- Every Stripe event we have already dealt with.
--
-- Stripe retries until it gets a 2xx, and will happily deliver the same event
-- twice — on a slow reply, or on its own redelivery. Recording the id first
-- and skipping anything already present is what makes handling one idempotent.
create table public.stripe_events (
  id text primary key,
  type text not null,
  received_at timestamptz not null default now()
);

alter table public.stripe_events enable row level security;
-- No policies at all: this is bookkeeping for the webhook, not user data.

-- Records an event and reports whether it is new. False means it has been
-- handled already and the caller should stop.
create function public.claim_stripe_event(p_id text, p_type text)
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
