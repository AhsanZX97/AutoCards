# Auto Cards

Turn PDFs into customizable, gamified flashcards. Web + mobile, sharing one core.

**Flashcard generation is real.** Every upload becomes cards written from your own PDF, generated server-side through a Supabase Edge Function that holds the OpenRouter key and counts each account's monthly allowance. **Authentication is real too**, via Supabase: sign-in/sign-up create real accounts, and decks sync across devices.

## Structure

```
packages/core/     Framework-agnostic domain logic, services, zustand stores
apps/web/          Vite + React + Tailwind SaaS app
apps/mobile/       Expo Router (React Native) app
```

`@autocards/core` is the single source of truth for both apps: types, the SRS scheduler, scoring engine, study-queue builder, auth/LLM/PDF services, and the zustand stores. Neither app duplicates business logic; both wire the same stores to platform-specific storage (`localStorage` vs `AsyncStorage`) and platform-specific UI.

## Getting started

Both apps require a Supabase project; there is no mocked fallback. Copy the `.env.example` in each
app to `.env.local` and fill in `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` (or the `EXPO_PUBLIC_`
equivalents). The schema lives in `supabase/schema.sql`.

Generation and subscriptions additionally need the Edge Functions deployed, with the OpenRouter and
Stripe keys set as project secrets (see [`supabase/functions/README.md`](supabase/functions/README.md)).
Those keys belong there. Do not put them in any `.env` the apps read.

```bash
npm install

npm run dev            # web app, http://localhost:5173
npm run dev:mobile      # mobile app via Expo (scan the QR code, or press a/i for a simulator)

npm test                # core package's vitest suite
npm run typecheck       # typecheck every workspace
npm run build           # production build of core + web
```

The OpenRouter key is never shipped to a client. Vite and Expo inline every public env value into
the bundle, so a key there could be read by anyone who loads the app, which would also make the
monthly upload allowance unenforceable. Generation goes through `generate-deck` instead, which
holds the key, checks the caller's plan and counts the upload in Postgres before spending anything.

## What's implemented

**Flashcards:** six types (basic, reversed, cloze deletion, multiple choice, true/false, type-the-answer), each with difficulty, priority, categories, tags, hints, explanations, starring, suspension, and manual weighting.

**Generation:** upload a PDF, tune card count/types/difficulty/instructions, watch a staged progress indicator, land on a generated deck. `RoutingLlmService` decides per call where the work goes: normally to `EdgeLlmService`, which posts to the `generate-deck` function; to `OpenRouterLlmService` if someone has supplied their own key, since that is their own money. With neither it throws `LlmConfigError` rather than degrading to canned content.

Model output is never trusted. `normalizeGeneratedCards` repairs what a model actually returns (assigning choice ids, marking the correct answer from a `correctIndex` or a matching `back`, defaulting `acceptedAnswers`, filling cloze front/back from the `{{c1::}}` markers), demotes a card to `basic` when its claimed type can't be honoured, and drops it only when even that fails. Invented card types, missing choices and unparseable JSON therefore produce a plainer deck rather than cards the study runner can't render or grade.

**Plans and billing:** free, pro ($4/month) and lifetime ($39 once), with the monthly generation allowance counted in Postgres rather than in the browser. Upgrading opens Stripe Checkout through `create-checkout-session`, which asks by *plan* and never by price; `stripe-webhook` is the only thing that writes `profiles.plan`, and it claims each event id once so a Stripe redelivery cannot apply twice. A failed card keeps access while Stripe retries, and drops it when Stripe gives up. Lifetime is a `payment`-mode checkout rather than a subscription, and `ownsOutright` stops any later subscription event revoking a plan somebody owns.

**Study modes:** Classic, Timed drill, Exam, Cram (misses re-queue until answered right), Spaced repetition (due-only), Survival (three lives). Six shuffle strategies (random, priority-first, hardest-first, weakest-first, most-overdue-first, deck order), per-card and whole-session timers, and filters by category/difficulty/priority/starred/due/mastery.

**Scoring:** base points scaled by difficulty, speed bonus, streak bonus, hint penalty, timeout penalty, a 0–100 accuracy-weighted letter grade (S/A/B/C/D/F), and XP feeding into an account-wide level curve.

**Spaced repetition:** an SM-2-derived scheduler (`packages/core/src/domain/srs.ts`) tracks ease, interval, lapses, and a derived 0–100 mastery score per card, independent of the study mode used.

**Stats:** streaks (with "at risk today" detection), a 12-week activity heatmap, per-deck performance, and an achievements grid.

**Sharing & import/export:** decks leave one account and re-enter another as a self-contained
`DeckExport` (`packages/core/src/lib/deckTransfer.ts`). A deck can be **exported** as a
`.autocards.json` file or **shared** as a link whose `?deck=` query parameter carries a URL-safe
base64 code of the same payload. Opening that link prompts the receiver to import it. On import the
deck, category and card ids are all remapped to fresh ones, so nothing collides with ids the
receiving account already owns, and cards start on a new SRS schedule: the export deliberately
carries card *content* (the `CardDraft`), never the sharer's mastery or review state.

The export format is versioned (`format: "autocards-deck"`, `version: 1`) and, like model output,
parse-time normalization repairs what it can (bad enum values, unmarked choice ids, cloze markers
that need filling in) and drops only cards that can't be salvaged, so a hand-edited or third-party
file degrades into a plainer deck rather than a broken one. Large decks are warned about on the web
(some chat apps truncate very long URLs) and a file export is offered as the reliable alternative.
Web wiring lives in the deck detail share modal, the library's import button, and
`ImportSharedDeck`; mobile uses the native share sheet and `expo-document-picker`.

## What's still mocked

| Concern | Current | Swap-in point |
|---|---|---|
| Flashcard generation | **Real**, via OpenRouter behind the `generate-deck` Edge Function | n/a |
| Payments | **Real**, via Stripe Checkout; `stripe-webhook` is the only thing that moves an account onto a paid plan | n/a |
| Auth | **Real**, via Supabase | n/a |
| PDF text extraction | `pdf.js` on web, which handles compressed content streams; a stub on mobile, so deck creation is disabled there for now | Native parser (mobile) behind the same `PdfExtractor` interface |

### The PDF extractor

`BrowserPdfExtractor` (`packages/core/src/services/pdf`) parses the document with `pdf.js`, walking
every page's text content rather than scanning for `Tj`/`TJ` operators in the raw bytes. That way
Flate-compressed content streams, which are how the vast majority of real PDFs are encoded, read
correctly. Scanned/image-only PDFs still have no text layer for `pdf.js` to find, so that case is
still flagged rather than papered over: the extractor marks the document `synthetic`, and
`ChatCompletionLlmService` refuses it up front with "no text could be read out of …" instead of
billing you for cards written about a placeholder.

## Testing

`packages/core` has 200 vitest unit tests covering the shuffle/filter engine, scoring math, SRS
scheduling, stats aggregation, model-output normalization, both generation transports (against a
stubbed `fetch`: request shape, error mapping, cancellation, quota exhaustion, and the
fenced/prose JSON a model actually returns), Supabase auth, and deck sync. The Edge Functions'
request clamping is tested by the same runner, which also fails if their copy of the plan limits
drifts from the app's. Deck transfer is covered too: export/parse
round-trips, lenient normalization of malformed input, and lossless unicode base64 share-code
round-trips. The web app was smoke-tested end to end in a real browser. The mobile app typechecks
cleanly against the same core but hasn't been run in a simulator in this environment, so review it
before shipping.
