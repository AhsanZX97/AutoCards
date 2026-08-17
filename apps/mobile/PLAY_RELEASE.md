# Google Play releases

Two tools, one credential.

| Tool | What it does | How you use it |
| --- | --- | --- |
| `eas` | Builds the AAB and uploads it to Play | terminal |
| `play-store` MCP | Reads/writes everything else in the Console — releases, rollouts, reviews, store listing, testers | ask Claude |

Both authenticate as the same Google Cloud **service account**. Nothing works until that
account exists and is linked to the Play Console.

## One-time setup

### 1. Service account — done

Created with `gcloud`:

| | |
| --- | --- |
| Google account | `redzx504@gmail.com` — the one that owns the Play Console |
| GCP project | `autocards-505514` |
| Service account | `autocards-play-publisher@autocards-505514.iam.gserviceaccount.com` |
| Key file | `C:\Users\ahsan\.config\play-store\service-account.json` |
| API enabled | `androidpublisher.googleapis.com` |

> **Two accounts, two "AutoCards" projects.** `degreatahsan@gmail.com` owns a *different*
> project also called AutoCards (`autocards-505209`). Play Console belongs to `redzx504`, so
> everything here must live under `autocards-505514`. Check `gcloud config list` before
> running any of the commands below — pointing them at the wrong project is the easy mistake.

The key lives **outside the repo on purpose** — it is a publishing credential and must never be
committed. The MCP server already reads it from that path.

To recreate it from scratch:

```bash
gcloud config set account redzx504@gmail.com
gcloud config set project autocards-505514
gcloud services enable androidpublisher.googleapis.com
gcloud iam service-accounts create autocards-play-publisher \
  --display-name="AutoCards Play Publisher"
gcloud iam service-accounts keys create \
  "C:/Users/ahsan/.config/play-store/service-account.json" \
  --iam-account="autocards-play-publisher@autocards-505514.iam.gserviceaccount.com"
```

No GCP IAM roles are needed on this account — every permission it has comes from the Play
Console grant below, not from Cloud IAM.

### 2. Grant it access in Play Console — still to do

Browser-only, and it needs the app to exist first.

1. Play Console → **Create app** for `app.autocards.mobile` (it does not exist yet).
2. Play Console → **Users and permissions → Invite new users**.
3. Paste `autocards-play-publisher@autocards-505514.iam.gserviceaccount.com`.
4. Grant at least: *View app information*, *Manage production releases*,
   *Manage store presence*, *Reply to reviews*.

Until this is done every API call returns `403 The caller does not have permission`. That error
means the key is fine and only the grant is missing — a bad key fails earlier, at token exchange.
Grants take a few minutes to propagate.

### 3. Hand the same key to EAS

```bash
cd apps/mobile
eas credentials --platform android
```

Choose **Google Service Account → Manage as uploader** and point it at the same JSON. EAS stores
it server-side, which is why [eas.json](eas.json) has no `serviceAccountKeyPath` — keeping an
absolute local path out of a committed file.

## Releasing

```bash
cd apps/mobile

eas build   --platform android --profile production
eas submit  --platform android --profile production   # → production track
eas submit  --platform android --profile preview      # → internal track, draft
```

`production` builds use `autoIncrement`, so the version code bumps itself.

> **First release is manual.** Google requires the very first AAB for a new package to be
> uploaded by hand in the Play Console before the API will accept anything for
> `app.autocards.mobile`. Every release after that can go through `eas submit`.

## Asking Claude instead

Once the key is in place, things like this work in a normal message:

- "what's the current staged rollout on production?"
- "bump the rollout to 50%"
- "show me this week's 1- and 2-star reviews"
- "update the short description to X"

## Config notes

- MCP server: `play-store`, registered at **user scope** in `C:\Users\ahsan\.claude.json`,
  so it is available from any project, not just this one.
- It runs via `uvx --from play-store-mcp --with "mcp<2" play-store-mcp`. The `mcp<2` pin is
  load-bearing: the package declares `mcp>=1.26.0` with no upper bound, and mcp 2.0.0 removed
  `mcp.server.fastmcp`, so an unpinned install crashes on import.
- `eas-cli` must be >= 21.0.0 to satisfy `cli.version` in [eas.json](eas.json).
