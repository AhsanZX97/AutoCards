-- Study reminder emails, as the account's schedule rather than the browser's.
--
-- These rows exist to be read by something the learner is not running: the
-- `send-reminders` function wakes on a cron and mails whoever is due. A
-- schedule kept only in local storage could never do that — the tab that owns
-- it is closed at 6pm on a Tuesday, which is exactly when the email is wanted.
--
-- Run against a project that already applied supabase/schema.sql.

create table if not exists public.deck_reminders (
  -- DeckReminder.id from createId(), e.g. "rem_m5x2k1..." — text, not uuid.
  id text primary key,
  deck_id text not null references public.decks(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  -- The ReminderCadence union, stored whole. Postgres never reasons about the
  -- shape; the sender does, and it is the only thing that has to agree with
  -- the client about what a cadence means.
  cadence jsonb not null,
  -- Local wall-clock 'HH:mm' and the IANA zone it is meant in. Both are needed
  -- to place a send: "18:00" is a different instant in Lisbon and Warsaw, and
  -- the server has no other way to know which was intended.
  time_of_day text not null,
  time_zone text not null,
  last_sent_at timestamptz,
  -- The next instant this reminder is due, in UTC. Materialised rather than
  -- worked out per row per run: it is what the cron query filters on, and a
  -- scan that had to interpret every cadence to find the due ones would read
  -- the whole table every hour.
  --
  -- Null means "not worked out yet" — a freshly written row. The sender fills
  -- it in and sends nothing that pass, so a new reminder never fires the
  -- moment it is created.
  next_send_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The cron query is exactly this predicate, so it is the index.
create index if not exists deck_reminders_due_idx
  on public.deck_reminders (next_send_at)
  where next_send_at is not null;

create index if not exists deck_reminders_owner_idx
  on public.deck_reminders (owner_id);
create index if not exists deck_reminders_deck_idx
  on public.deck_reminders (deck_id);

-- A deck may hold only so many reminders. Enforced here as well as in the app
-- because the app's copy is a courtesy — this is the one a forged request has
-- to get past, and the row that would make it six is the one that costs a
-- sixth email every single day.
create or replace function public.enforce_reminder_limit() returns trigger
language plpgsql as $$
declare existing int;
begin
  select count(*) into existing
    from public.deck_reminders
    where deck_id = new.deck_id and id <> new.id;
  if existing >= 5 then
    raise exception 'a deck may hold at most 5 reminders';
  end if;
  return new;
end;
$$;

drop trigger if exists deck_reminders_limit on public.deck_reminders;
create trigger deck_reminders_limit
  before insert on public.deck_reminders
  for each row execute function public.enforce_reminder_limit();

-- owner_id always derives from the parent deck, exactly as it does for cards:
-- the client never asserts it, which also blocks hanging a reminder off
-- someone else's deck id to find out when they study.
create or replace function public.set_reminder_owner() returns trigger
language plpgsql as $$
begin
  select owner_id into new.owner_id from public.decks where id = new.deck_id;
  if new.owner_id is null then
    raise exception 'no such deck';
  end if;
  return new;
end;
$$;

drop trigger if exists deck_reminders_owner_from_deck on public.deck_reminders;
create trigger deck_reminders_owner_from_deck
  before insert or update on public.deck_reminders
  for each row execute function public.set_reminder_owner();

alter table public.deck_reminders enable row level security;

-- Dropped first so this file can be re-run; `create policy` has no
-- `if not exists`.
drop policy if exists "reminders are owner-readable" on public.deck_reminders;
create policy "reminders are owner-readable" on public.deck_reminders
  for select using (owner_id = auth.uid());

drop policy if exists "reminders are owner-insertable" on public.deck_reminders;
create policy "reminders are owner-insertable" on public.deck_reminders
  for insert with check (
    exists (select 1 from public.decks d where d.id = deck_id and d.owner_id = auth.uid())
  );

drop policy if exists "reminders are owner-updatable" on public.deck_reminders;
create policy "reminders are owner-updatable" on public.deck_reminders
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "reminders are owner-deletable" on public.deck_reminders;
create policy "reminders are owner-deletable" on public.deck_reminders
  for delete using (owner_id = auth.uid());

-- `next_send_at` and `last_sent_at` are the sender's bookkeeping, not the
-- learner's settings. Revoking them from the client keeps a tab from moving
-- its own next send — forward to mail itself early, or back to sit due
-- forever — while leaving the schedule itself fully editable.
revoke update (next_send_at, last_sent_at, owner_id) on public.deck_reminders from authenticated;
