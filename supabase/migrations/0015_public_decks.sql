-- Public deck pages: the schema half of opt-in, indexable decks.
--
-- Whether a deck's page is *indexable* (worth a search engine's attention) is
-- decided in `packages/core/src/domain/deckPublication.ts` — minimum card
-- count, independent study, near-duplicate title — because that gate is
-- allowed to change its mind as thresholds are tuned without a migration.
-- What lives here is the narrower, DB-enforceable half: whether a deck's page
-- exists at all (`is_public`) and what it lives at (`public_slug`), plus the
-- RLS that lets a signed-out reader see it. Nothing here decides indexing —
-- that stays app-side, read by whatever renders the `<meta name="robots">`
-- tag.
--
-- Run against a project that already applied supabase/schema.sql.

alter table public.decks add column if not exists is_public boolean not null default false;
alter table public.decks add column if not exists public_slug text;

-- A deck can't go public without somewhere to send a reader. Doesn't require
-- the slug to be unique by itself — the partial index below does that — just
-- that it isn't null while `is_public` is true.
alter table public.decks drop constraint if exists decks_public_slug_required;
alter table public.decks
  add constraint decks_public_slug_required
  check (not is_public or public_slug is not null);

-- Partial, not a plain unique index, and scoped to live rows only: a
-- soft-deleted deck keeps its `public_slug` for the tombstone's sake (same
-- reason it keeps the rest of `data`), but that must not permanently squat
-- the URL. Deleting a deck and publishing a new one under the same title
-- gets the same slug back rather than colliding with its own ghost.
create unique index if not exists decks_public_slug_uidx
  on public.decks (public_slug)
  where deleted_at is null and public_slug is not null;

-- What a sitemap/listing query filters and sorts by.
create index if not exists decks_public_updated_idx
  on public.decks (updated_at)
  where is_public and deleted_at is null;

-- Anyone, signed in or not, may read a public deck's row — but never a
-- soft-deleted one; anon has no business seeing a tombstone that exists only
-- for a device's own sync to catch up on. This is an additional permissive
-- policy: Postgres ORs it with "decks are owner-readable" from schema.sql, so
-- the owner keeps seeing their own private and archived decks exactly as
-- before.
drop policy if exists "public decks are readable by anyone" on public.decks;
create policy "public decks are readable by anyone" on public.decks
  for select using (is_public and deleted_at is null);

-- Same shape for the cards underneath a public deck, since a deck page is
-- nothing without them. Ownership of the parent deck is what's checked, not
-- the card's own owner_id — a public deck's cards are exactly as public as
-- the deck.
drop policy if exists "cards of public decks are readable by anyone" on public.cards;
create policy "cards of public decks are readable by anyone" on public.cards
  for select using (
    deleted_at is null
    and exists (
      select 1 from public.decks d
      where d.id = cards.deck_id and d.is_public and d.deleted_at is null
    )
  );

-- Publishing and unpublishing is nothing but an UPDATE of `is_public` /
-- `public_slug`, already covered by "decks are owner-updatable" in
-- schema.sql (owner_id = auth.uid()). No new write policy needed — only the
-- read side is new. Who is *allowed* to flip the flag (not an archived deck,
-- only its owner) is `canSetDeckVisibility` in domain/deckPublication.ts; the
-- database only knows ownership, the same division already drawn for every
-- other business rule in this schema.

-- `distinctNonAuthorStudiers` in the indexability gate is answered by
-- counting study_sessions rows for a deck whose owner_id isn't the deck's
-- author. `deck_id` only exists inside `data` here (study_sessions has no FK
-- to decks — see schema.sql), so that lookup needs this to not be a table
-- scan.
create index if not exists study_sessions_deck_idx
  on public.study_sessions ((data ->> 'deckId'));
