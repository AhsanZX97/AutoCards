-- Study history, as the account's record rather than the browser's.
--
-- Streak, level/XP, accuracy and the activity heatmap are all derived from
-- `studyStore.history`, which until now lived only in local storage under a
-- key with no user in it. That made the numbers wrong in both directions: a
-- second account signing in on the same browser inherited the first one's
-- stats, and the same account on a new device started from zero.
--
-- Run against a project that already applied supabase/schema.sql.

create table if not exists public.study_sessions (
  -- SessionSummary.id from createId(), e.g. "session_m5x2k1..." — text, not uuid.
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  -- Server clock, not the client's `endedAt`. This is the column pulls page
  -- through, and a device flushing a run it finished offline yesterday has to
  -- land *after* cursors that have already moved past that wall-clock time.
  updated_at timestamptz not null default now(),
  data jsonb not null
);

-- Deliberately no FK to decks: a summary outlives the deck it came from.
-- Deleting a deck should not silently erase the XP and streak days already
-- earned on it, and `history` already keeps entries for decks that are gone.
create index if not exists study_sessions_owner_updated_idx
  on public.study_sessions (owner_id, updated_at);

alter table public.study_sessions enable row level security;

-- Dropped first so this file can be re-run; `create policy` has no
-- `if not exists`.
drop policy if exists "sessions are owner-readable" on public.study_sessions;
create policy "sessions are owner-readable" on public.study_sessions
  for select using (owner_id = auth.uid());

drop policy if exists "sessions are owner-writable" on public.study_sessions;
create policy "sessions are owner-writable" on public.study_sessions
  for insert with check (owner_id = auth.uid());

-- No update or delete policy: a finished run is a fact. Nothing in the app
-- edits or removes one, so the client is given no way to rewrite its own
-- history — which is also what lets the pull merge treat rows as append-only
-- and skip tombstone handling entirely.
