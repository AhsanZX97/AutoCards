-- Usernames instead of full names.
-- Run against a project that already applied supabase/schema.sql.
--
-- Existing rows keep their old `name` value as their username (lowercased).
-- If that would produce duplicates, the unique index below fails — dedupe
-- first, e.g. by appending their id: `username || '-' || left(id, 6)`.

alter table public.profiles rename column name to username;
alter table public.profiles alter column username set not null;

-- Enforce uniqueness on the lowercased value.
create unique index if not exists profiles_username_uidx on public.profiles (lower(username));

-- Backfill recency-compatible default: seed usernames from stored values.
update public.profiles set username = lower(username) where username <> lower(username);

-- New sign-ups take the username from raw_user_meta_data instead of name.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer as $$
begin
  insert into public.profiles (id, username)
  values (new.id, lower(coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1))));
  return new;
end;
$$;