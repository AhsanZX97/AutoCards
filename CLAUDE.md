# AutoCards

Turn uploaded documents (PDF, Word, PowerPoint, text, Markdown) into gamified flashcards. Web +
mobile, sharing one core package. Supabase for auth/data, Edge Functions for anything that spends
money, Stripe for plans.

## Layout

```
packages/core/      @autocards/core — types, domain logic, services, zustand stores
apps/web/           Vite + React + Tailwind + react-router (the shipping app)
apps/mobile/        Expo Router (React Native)
supabase/           schema.sql, migrations, Edge Functions
scripts/notion-agent/  scripts behind .github/workflows/notion-agent.yml
```

npm workspaces. Node >= 20.

## Commands

Run from the repo root:

```bash
npm run dev            # web app on http://localhost:5173
npm run dev:mobile     # Expo
npm test               # core's vitest suite (48 files, 741 tests) — the only tests in the repo
npm run typecheck      # every workspace, including mobile
npm run build          # core + web production build
```

`npm test` and `npm run typecheck` both pass on `main`. Keep it that way — run both before calling
anything done.

## Git

**Never commit and never push.** Leave finished work in the working tree and tell me what changed;
I'll review the diff and commit it myself. This holds even when a task looks obviously complete,
and even if I said "make the change" — that is not permission to commit it. The same goes for
anything that publishes work outward: no branches, no worktrees, no `gh pr create`, no force-push,
no tags.

Read-only git is fine and often useful — `git status`, `git diff`, `git log`, `git show`.

If you think a commit is genuinely the right next step, say so and stop; don't do it and report it
afterwards.

## Architecture rules

- **`@autocards/core` owns all business logic.** Types, SRS scheduler, scoring, study-queue
  builder, document extraction, LLM services, sync engine and every zustand store live there.
  Neither app may duplicate or reimplement that logic — if a screen needs a rule, the rule goes in
  core and the screen calls it.
- **Apps supply three things only:** a `StorageAdapter` (`localStorage` vs `AsyncStorage`), a
  `DocumentExtractor`, and platform UI. Everything is wired in
  [createApp.ts](packages/core/src/createApp.ts) and handed to screens through each app's
  `src/lib/appContext.tsx`.
- **Services sit behind interfaces** (`LlmService`, `AuthService`, `BillingService`,
  `DocumentExtractor`, `SyncBackend`). Screens talk to the interface, never to a concrete class.
- **Never trust model or file input.** `normalizeGeneratedCards` and the deck-transfer parser
  repair what they can and demote or drop the rest; malformed input must degrade into a plainer
  deck, never a crash or an unrenderable card.

## Secrets

The OpenRouter key and the Stripe secret key belong in Supabase project secrets, read only by Edge
Functions. Vite and Expo inline every public env value into the bundle, so a key in `.env.local`
is readable by anyone who loads the app — and would make the monthly upload allowance
unenforceable. Generation goes through `generate-deck`; checkout through
`create-checkout-session`; only `stripe-webhook` writes `profiles.plan`. See
[supabase/functions/README.md](supabase/functions/README.md).

## Testing

- Vitest, in `packages/core` only. Tests live in `__tests__/` next to the file under test, named
  after it (`scoring.ts` → `__tests__/scoring.test.ts`).
- Mock only at boundaries — `fetch`, Supabase, storage. Don't mock code in this repo; test through
  it.
- Web app changes have no automated coverage, so verify them in the browser.

## Known gaps

- Scanned/image-only PDFs have no text layer and are rejected up front rather than sent to a model.
- **Mobile reads PDFs over the network, not on the device.** Hermes has no `structuredClone`,
  `Promise.withResolvers` or `DOMMatrix`, so pdf.js cannot run there at all. `EdgePdfExtractor`
  posts the file to the `extract-document` Edge Function, which runs the same pdf.js the web app
  does and returns the page text; `buildPdfDocument` then turns that into a document on both
  platforms. So a PDF needs a signed-in session and a connection on mobile, where web reads it
  locally. Word, PowerPoint, text and Markdown are plain JS over bytes and still read on-device.
  `StubDocumentExtractor` remains only for a build with no Supabase project configured.

## Notion shorthand

When working in this repo, these phrases refer to specific Notion pages. Go straight to the URL —
don't search for them.

| When I say | I mean |
| --- | --- |
| "the notion page", "our notion page", "the project page" | **🃏 AutoCards** — https://app.notion.com/p/3b4737e1e10681d49354ebe7aebc8e3c |
| "the jira board", "the board", "the backlog" | **Jira Board** — https://app.notion.com/p/5e8511c0ea044a6c96af1a9fceb517b1 |

Notes:

- I often call the project page **"AutoDecks"**. The page is actually titled **AutoCards** —
  searching Notion for "AutoDecks" returns nothing. Use the URL above.
- New pages I ask for "on the notion page" go there as **subpages**, unless I say otherwise.
- The Jira Board is a database. To create tickets, use its data source:
  `collection://9062e0f9-8043-45d4-be8f-8452fb2068ca`
- Board schema: `Name` (title) and `Status`, one of `Todo` / `Doing` / `Review` / `Done` /
  `Backlog`. New tickets go to **Backlog** unless I say otherwise.
- The Jira Board and the **Test Cases** page both live under the AutoCards page.
- Treat a question as a question — answer it, then stop. Treat an imperative ("add," "fix," "build") as the go-ahead to work: make reasonable assumptions, no preamble/summaries, only ask if genuinely blocked. Don't explain things I didn't ask about.
