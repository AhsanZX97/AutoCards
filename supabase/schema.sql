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
  plan text not null default 'free' check (plan in ('free','pro','team')),
  created_at timestamptz not null default now()
);

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
create function public.cascade_deck_delete() returns trigger
language plpgsql as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    update public.cards set deleted_at = new.deleted_at
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

alter table public.profiles enable row level security;
alter table public.decks enable row level security;
alter table public.cards enable row level security;

create policy "profiles are self-readable" on public.profiles
  for select using (id = auth.uid());
create policy "profiles are self-updatable" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

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

-- No delete policies: the client only ever soft-deletes via UPDATE.
--
-- Pull queries must NOT filter out tombstones — a client that missed a
-- delete needs to see it to remove the row locally:
--   select * from decks where owner_id = :uid and updated_at > :since
--   select * from cards where owner_id = :uid and updated_at > :since
