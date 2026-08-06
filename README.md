# Auto Cards

Turn PDFs into customizable, gamified flashcards. Web + mobile, sharing one core.

This is the first iteration: **authentication and flashcard generation are mocked**. Sign-in accepts any well-formed email, and every upload produces the same curated demo deck (on study-technique fundamentals) so the whole product — customization, study modes, scoring, spaced repetition, stats — can be exercised end to end before a real backend or LLM is wired up.

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

## What's implemented

**Flashcards** — six types (basic, reversed, cloze deletion, multiple choice, true/false, type-the-answer), each with difficulty, priority, categories, tags, hints, explanations, starring, suspension, and manual weighting.

**Generation** — upload a PDF, tune card count/types/difficulty/instructions, watch a staged progress indicator, land on a generated deck. `MockLlmService` returns a curated 16-card deck regardless of the PDF's actual content; `OpenRouterLlmService` (packages/core/src/services/llm/openRouter.ts) is a ready-to-wire real implementation — supplying an OpenRouter key to `createApp()` swaps it in with no changes elsewhere.

**Study modes** — Classic, Timed drill, Exam, Cram (misses re-queue until answered right), Spaced repetition (due-only), Survival (three lives). Six shuffle strategies (random, priority-first, hardest-first, weakest-first, most-overdue-first, deck order), per-card and whole-session timers, and filters by category/difficulty/priority/starred/due/mastery.

**Scoring** — base points scaled by difficulty, speed bonus, streak bonus, hint penalty, timeout penalty, a 0–100 accuracy-weighted letter grade (S/A/B/C/D/F), and XP feeding into an account-wide level curve.

**Spaced repetition** — an SM-2-derived scheduler (`packages/core/src/domain/srs.ts`) tracks ease, interval, lapses, and a derived 0–100 mastery score per card, independent of the study mode used.

**Stats** — streaks (with "at risk today" detection), a 12-week activity heatmap, per-deck performance, and an achievements grid.

## Mocked today, real tomorrow

| Concern | Current | Swap-in point |
|---|---|---|
| Auth | `MockAuthService` — any email/8+ char password | Implement the `AuthService` interface (`packages/core/src/services/auth`) |
| Flashcard generation | `MockLlmService` — canned deck | `OpenRouterLlmService` already implements the real API call; pass `openRouter: { apiKey }` to `createApp()` |
| PDF text extraction | Naive regex-based extractor on web; a stub on mobile | Swap in `pdf.js` (web) or a native parser (mobile) behind the same `PdfExtractor` interface |

## Testing

`packages/core` has 75 vitest unit tests covering the shuffle/filter engine, scoring math, SRS scheduling, and stats aggregation. The web app was smoke-tested end-to-end in a real browser (sign-in → generate a deck from an uploaded PDF → study every card type → check stats/settings). The mobile app typechecks cleanly against the same core but hasn't been run in a simulator in this environment — review before shipping.
