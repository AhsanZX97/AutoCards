# Auto Cards

Turn PDFs into customizable, gamified flashcards. Web + mobile, sharing one core.

**Flashcard generation is real** — add an OpenRouter key and uploads produce cards written from your own PDF. Without a key the app falls back to a curated demo deck, so the whole product — customization, study modes, scoring, spaced repetition, stats — can still be exercised end to end. **Authentication is still mocked**: sign-in accepts any well-formed email.

## Structure

```
packages/core/     Framework-agnostic domain logic, mocked services, zustand stores
apps/web/          Vite + React + Tailwind SaaS app
apps/mobile/       Expo Router (React Native) app
```

`@autocards/core` is the single source of truth for both apps: types, the SRS scheduler, scoring engine, study-queue builder, mock auth/LLM/PDF services, and the zustand stores. Neither app duplicates business logic — they wire the same stores to platform-specific storage (`localStorage` vs `AsyncStorage`) and platform-specific UI.

## Getting started

```bash
npm install

npm run dev            # web app, http://localhost:5173
npm run dev:mobile      # mobile app via Expo (scan the QR code, or press a/i for a simulator)

npm test                # core package's vitest suite
npm run typecheck       # typecheck every workspace
npm run build           # production build of core + web
```

Sign in with any valid-looking email (8+ character password), or tap **"Fill demo credentials"** on the sign-in screen for a pre-seeded demo account.

### Turning on real generation

Paste an [OpenRouter key](https://openrouter.ai/keys) into **Settings → Generation**. It is stored in
your browser and takes effect on the next deck — no reload, and clearing it drops straight back to
the demo deck.

For local development you can skip the UI and put the key in `apps/web/.env.local` instead:

```bash
cp apps/web/.env.example apps/web/.env.local   # then fill in VITE_OPENROUTER_API_KEY
```

⚠️ **Do not set that variable for a deployed build.** Vite inlines it into the client bundle, where
anyone can read it. A shipped build should have no key of its own — each user supplies theirs in
Settings, or you put a server in front that holds the key and proxies the call.

## What's implemented

**Flashcards** — six types (basic, reversed, cloze deletion, multiple choice, true/false, type-the-answer), each with difficulty, priority, categories, tags, hints, explanations, starring, suspension, and manual weighting.

**Generation** — upload a PDF, tune card count/types/difficulty/instructions, watch a staged progress indicator, land on a generated deck. `RoutingLlmService` picks the implementation per call from the key currently in settings: `OpenRouterLlmService` when there is one, `MockLlmService` (a curated 16-card deck, ignoring the PDF) when there isn't.

Model output is never trusted. `normalizeGeneratedCards` repairs what a model actually returns — assigning choice ids, marking the correct answer from a `correctIndex` or a matching `back`, defaulting `acceptedAnswers`, filling cloze front/back from the `{{c1::}}` markers — demotes a card to `basic` when its claimed type can't be honoured, and drops it only when even that fails. Invented card types, missing choices and unparseable JSON therefore produce a plainer deck rather than cards the study runner can't render or grade.

**Study modes** — Classic, Timed drill, Exam, Cram (misses re-queue until answered right), Spaced repetition (due-only), Survival (three lives). Six shuffle strategies (random, priority-first, hardest-first, weakest-first, most-overdue-first, deck order), per-card and whole-session timers, and filters by category/difficulty/priority/starred/due/mastery.

**Scoring** — base points scaled by difficulty, speed bonus, streak bonus, hint penalty, timeout penalty, a 0–100 accuracy-weighted letter grade (S/A/B/C/D/F), and XP feeding into an account-wide level curve.

**Spaced repetition** — an SM-2-derived scheduler (`packages/core/src/domain/srs.ts`) tracks ease, interval, lapses, and a derived 0–100 mastery score per card, independent of the study mode used.

**Stats** — streaks (with "at risk today" detection), a 12-week activity heatmap, per-deck performance, and an achievements grid.

## Mocked today, real tomorrow

| Concern | Current | Swap-in point |
|---|---|---|
| Flashcard generation | **Real**, via OpenRouter, whenever a key is present | — |
| Auth | `MockAuthService` — any email/8+ char password | Implement the `AuthService` interface (`packages/core/src/services/auth`) |
| PDF text extraction | `pdf.js` on web — handles compressed content streams; a stub on mobile | Native parser (mobile) behind the same `PdfExtractor` interface |

### The PDF extractor

`BrowserPdfExtractor` (`packages/core/src/services/pdf`) parses the document with `pdf.js`, walking
every page's text content rather than scanning for `Tj`/`TJ` operators in the raw bytes — so
Flate-compressed content streams, which are how the vast majority of real PDFs are encoded, read
correctly. Scanned/image-only PDFs still have no text layer for `pdf.js` to find, so that case is
still flagged rather than papered over: the extractor marks the document `synthetic`, and
`OpenRouterLlmService` refuses it up front with "no text could be read out of …" instead of billing
you for cards written about a placeholder.

## Testing

`packages/core` has 157 vitest unit tests covering the shuffle/filter engine, scoring math, SRS
scheduling, stats aggregation, model-output normalization, and the OpenRouter client (against a
stubbed `fetch` — request shape, error mapping, cancellation, and the fenced/prose JSON a model
actually returns). The web app was smoke-tested end to end in a real browser. The mobile app
typechecks cleanly against the same core but hasn't been run in a simulator in this environment —
review before shipping.
