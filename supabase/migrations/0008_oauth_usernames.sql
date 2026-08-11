-- Usernames for accounts that never picked one.
--
-- Run against a project that already applied supabase/schema.sql and 0001-0007.
--
-- Password sign-up sends a handle the person typed, in `raw_user_meta_data`.
-- An OAuth sign-in sends whatever the provider supplies, and Google supplies
-- no handle at all — so `handle_new_user` fell through to the email prefix.
-- That is not safe as a username:
--
--   * it collides. `alex@gmail.com` and `alex@outlook.com` both reduce to
--     "alex", the second one violates `profiles_username_uidx`, and because the
--     trigger runs inside the transaction that inserts the auth user, the
--     violation fails the *sign-in* — the user is told "Database error saving
--     new user" and can never get in. A first-come-first-served race on a
--     common first name is not a launch this survives.
--   * it is not a valid handle. `ahsan.khan@…` yields "ahsan.khan", which the
--     app's own `isValidUsername` rejects, so the profile is born in a state
--     Settings will not let its owner save.
--   * it can be too short, or absent entirely.
--
-- So: derive a handle that fits the rules, and make it unique by suffixing.
--
-- Only when the person did not choose one. A handle that came from the sign-up
-- form is still inserted exactly as typed and still allowed to raise 23505 —
-- `SupabaseAuthService.signUp` turns that into "That username is already
-- taken", and silently handing someone `alex1` because `alex` was gone would
-- be a worse answer than telling them.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer as $$
declare
  chosen   text := nullif(trim(new.raw_user_meta_data->>'username'), '');
  source   text;
  base     text;
  handle   text;
  attempt  int := 0;
begin
  -- The path password sign-up takes. Unchanged on purpose, including the
  -- unique violation it may raise.
  if chosen is not null then
    insert into public.profiles (id, username) values (new.id, lower(chosen));
    return new;
  end if;

  -- Nothing was chosen, so build one. Google sends `full_name` and `name`; the
  -- email prefix is the last resort before giving up on readability.
  source := coalesce(
    nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
    nullif(trim(new.raw_user_meta_data->>'name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    ''
  );

  -- The app's rule, applied here rather than trusted: lowercase a-z, 0-9 and
  -- underscore, 3-20 characters.
  base := left(regexp_replace(lower(source), '[^a-z0-9_]', '', 'g'), 20);

  -- Too short to be a handle — an address like `hi@…`, or a name written in a
  -- script that leaves nothing behind. The user id is the one thing guaranteed
  -- to be present and unique.
  if length(base) < 3 then
    base := left('user' || replace(new.id::text, '-', ''), 20);
  end if;

  handle := base;

  -- Suffix until it lands. The loop is the guard rather than a pre-flight
  -- `select`, because two sign-ups in the same instant would both pass a check
  -- and only one would survive the insert.
  loop
    begin
      insert into public.profiles (id, username) values (new.id, handle);
      return new;
    exception when unique_violation then
      attempt := attempt + 1;
      -- Room for the digits is taken out of the base, so the result still fits
      -- the 20-character limit.
      handle := left(base, 20 - length(attempt::text)) || attempt::text;
      -- A name this contested is not worth another twenty round trips; fall
      -- back to something that cannot collide. Whoever ends up with it can
      -- rename themselves in Settings.
      if attempt >= 20 then
        handle := left('user' || replace(new.id::text, '-', ''), 20);
        insert into public.profiles (id, username) values (new.id, handle);
        return new;
      end if;
    end;
  end loop;
end;
$$;
