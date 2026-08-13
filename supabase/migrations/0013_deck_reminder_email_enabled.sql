-- Lets a reminder skip the email and rely on the device's own local push
-- instead — the option mobile's editor exposes, that web's does not.
--
-- Unlike `next_send_at`/`last_sent_at`, this is part of the schedule itself:
-- the editor sets it, so it stays writable by `authenticated` rather than
-- being revoked like the sender's own bookkeeping.
--
-- Run against a project that already applied migration 0009.

alter table public.deck_reminders
  add column if not exists email_enabled boolean not null default true;
