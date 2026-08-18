# Supabase setup

`schema.sql` is the base; `migrations/` layer on top of it in order. Edge Function keys and
deployment live in [`functions/README.md`](functions/README.md).

## The analytics page

`/app/analytics` in the web app is the owner's dashboard. It needs two things doing by hand on a
project, both one-off:

1. Apply `migrations/0014_admin_analytics.sql` in the SQL editor. It creates `admin_analytics`,
   which returns the whole report as one `jsonb` payload. **Run it as `postgres`** (which the SQL
   editor already is) — it is `security definer`, so it executes as whoever owns it, and reading
   `auth.users` is part of what it does.
2. Make yourself an admin, if you are not already:

   ```sql
   update public.profiles set is_admin = true where username = '<you>';
   ```

The flag is the whole gate. The function checks it before it reads anything and raises otherwise,
so the route guard and the hidden nav link in the app are conveniences, not the security boundary.
Nothing else in the app calls it, and no other account can.

`analytics.sql` holds the same questions as loose snippets for the SQL editor. Change one, look at
the other.

## Sign in with Google

Done, end to end, on the hosted project (`aiqoojayjueqrgpnaqkl`):

- Google client created (Web application), consent screen published.
- Redirect URI on the Google side corrected to
  `https://aiqoojayjueqrgpnaqkl.supabase.co/auth/v1/callback` — the value entered at client-creation
  time was missing the `/auth/v1/callback` path, which would have failed every sign-in with
  `redirect_uri_mismatch`.
- `migrations/0008_oauth_usernames.sql` applied.
- `/auth/callback` added to the hosted project's redirect allow-list.
- `[auth.external.google]` pushed to the hosted project with the real client ID and secret.

Client ID (public): `900760240006-3bnfd88umjb6dqnm65c66ugs6pp1l904.apps.googleusercontent.com`.

The secret is **not** written anywhere in this repo, on disk, or in shell history — it was piped
straight from the Google console into one `config push` command and discarded. Google will not
show it again either (their console only offers "add a new secret", not "reveal the old one"), so
**store it somewhere durable now** — a password manager, or wherever the team keeps production
secrets — or the next person who needs to touch this config has to mint yet another one.

### If this needs to be redone or rotated

There is no CLI for creating the Google client itself. `gcloud iam oauth-clients` is workforce
identity federation (signing your own staff in *to* Google Cloud) and `gcloud iap oauth-clients` is
Identity-Aware Proxy — neither mints the "Web application" client consumer sign-in needs. That part
is console-only: Google Auth Platform → Clients → Create client → Web application, with:

- **Authorized JavaScript origins**: `https://autocards.study`, `http://localhost:5173`
- **Authorized redirect URIs**: `https://aiqoojayjueqrgpnaqkl.supabase.co/auth/v1/callback` and
  `http://127.0.0.1:54321/auth/v1/callback` — Supabase's callback, not the app's. Easy to enter
  without the `/auth/v1/callback` suffix, which looks fine and then fails silently.

Getting the pair into Supabase **is** scriptable, via `supabase config push` — but it has a sharp
edge, hit once already while setting this up:

`config push` resolves `env(SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID)` /
`env(..._SECRET)` from **whatever shell runs the command**, not from anything stored in the
project. Run it with those two vars unset and it does not skip the Google block or leave it
alone — it pushes `enabled = true` with the literal text `"env(SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID)"`
as the client ID and an empty secret, live, silently. The button stays visible and simply fails for
every visitor until someone notices. Always:

```
SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=... SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET=... \
  npx supabase config push
```

For local `supabase start`, the same two vars can instead live in `supabase/.env` (git-ignored).

### Consent screen

Published (production, not Testing) — so it is not limited to a test-user allow-list. Only the
default `openid`/`email`/`profile` scopes are requested, which is why publishing didn't trigger
Google's app-verification review; that review only kicks in for sensitive/restricted scopes.

## Email confirmation

Still on, and Google does not weaken it: an address Google hands over has already been verified by
Google, which is the same thing the confirmation email exists to establish. Anyone typing an
address into the form still has to prove they own it.
