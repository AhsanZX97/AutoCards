# Edge Functions

Everything here exists for one reason: these are the only places a secret
lives. The OpenRouter key and the Stripe key are both server-side, and so are
the two things they decide: how much someone may generate, and what they are
paying for.

While the OpenRouter key was compiled into the web and mobile bundles, every
plan limit was a suggestion. Anyone could read the key out of the JavaScript
and generate as much as they liked, and the monthly count sat in local storage
they could clear.

| Function | What it does | Auth |
| --- | --- | --- |
| `generate-deck` | Writes a deck from an uploaded document. Costs one upload. | User JWT |
| `suggest-choice` | One wrong answer for a multiple-choice card. Costs nothing. | User JWT |
| `create-checkout-session` | Starts a Stripe Checkout for a plan. Grants nothing. | User JWT |
| `create-portal-session` | Opens Stripe's Customer Portal for cancelling, card changes and invoices. | User JWT |
| `stripe-webhook` | The only thing that can put an account on a paid plan. | Stripe signature |

## What the server decides

The client still writes the prompt. That logic lives in
`packages/core/src/services/llm/openRouter.ts` and there is no second copy of
it here. What this side re-decides is everything that determines the bill:

- **Who is calling.** The bearer token is resolved to a user, and the plan is
  read from `profiles`, never taken from the request.
- **Whether they have an upload left.** `spend_upload` checks and increments in
  one statement, so two tabs cannot both spend the last one. It is given back if
  the model never ran.
- **What may be asked for.** `_shared/chatRequest.ts` rebuilds the request field
  by field: only catalogue models, a clamped output budget, a capped amount of
  text and inline-only images. Anything it does not recognise is dropped rather
  than forwarded.

What it does *not* see is the uploaded document itself, only the prompt built
from it, so per-plan page and deck limits stay client-side checks. The upload
count and the payload ceilings are what bound the spend.

## How a plan is bought

```
Settings ──▶ create-checkout-session ──▶ Stripe Checkout ──▶ card paid
                    (asks by plan,              │
                     never by price)            ▼
profiles.plan ◀── stripe-webhook ◀────── checkout.session.completed
                (signature checked,             customer.subscription.*
                 event id claimed once)
```

Two rules hold this together:

- **The client cannot grant itself anything.** It asks for a *plan*; the price
  is read from this project's environment. Checkout succeeding is not what
  upgrades an account; only a signed Stripe event does that.
- **The webhook is safe to run twice.** Stripe retries until it gets a 2xx and
  redelivers on its own schedule, so each event id is claimed in
  `stripe_events` before it is applied and handed back if applying failed.

`past_due` deliberately keeps the plan: Stripe sets it while retrying a card
that failed, which is usually an expired card rather than someone leaving.
Access stops when Stripe gives up and moves to `canceled` or `unpaid`. The
rules are in `_shared/billing.ts` and tested in `_shared/__tests__`.

## Stripe setup

1. Create two **Products** (Stripe dashboard → Product catalogue) and copy each
   price id. They look like `price_1ABC…`:
   - **Pro**, with a *recurring* price of $4/month.
   - **Lifetime**, with a *one-time* price of $39. It must be one-time: the
     checkout mode follows from the plan, and a recurring price in a `payment`
     session is rejected by Stripe.
2. Set the secrets:

```bash
npx supabase secrets set STRIPE_SECRET_KEY=sk_test_...
npx supabase secrets set STRIPE_PRICE_PRO=price_...
npx supabase secrets set STRIPE_PRICE_LIFETIME=price_...
npx supabase secrets set APP_URL=http://localhost:5173   # where Checkout returns to
```

3. Add the webhook endpoint in Stripe (Developers → Webhooks), pointing at

```
https://<project-ref>.supabase.co/functions/v1/stripe-webhook
```

   subscribed to `checkout.session.completed`,
   `checkout.session.async_payment_succeeded`,
   `customer.subscription.created`, `customer.subscription.updated` and
   `customer.subscription.deleted`. The async one is what entitles a lifetime
   buyer who paid by a method that does not clear on the spot. Without it,
   their money arrives and their plan does not. Copy the signing secret:

```bash
npx supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
```

4. Turn on the **Customer Portal**: Settings → Billing → Customer portal, then
   save it once (per mode). `create-portal-session` fails with "no configuration
   provided" until that has been done, which is the usual reason a working
   integration cannot open billing.

A plan whose price secret is unset simply cannot be bought. The checkout
refuses it rather than falling back to something cheaper.

Test-mode and live-mode prices are different ids, so a deployment pointed at
live keys needs its own `STRIPE_PRICE_PRO` and `STRIPE_PRICE_LIFETIME`.

## Lifetime is not a subscription

`lifetime` is bought with a single `payment`-mode checkout, so no
`customer.subscription.*` event will ever mention it. Two things follow, both
in `_shared/billing.ts`:

- The plan is stamped in the **session metadata** at checkout, because a
  one-off event carries no subscription to resolve a price against.
- `ownsOutright` stops a later subscription event overwriting it. There is one
  `subscriptions` row per account, so a Pro subscription cancelled after buying
  lifetime would otherwise put a paying customer back on free.

## Deploying

```bash
# once per machine
npm install -g supabase          # or use npx supabase for everything below
npx supabase link --project-ref <your-project-ref>

# the key, set on the project rather than in any bundle
npx supabase secrets set OPENROUTER_API_KEY=sk-or-...
npx supabase secrets set APP_URL=https://your-app-url   # optional, attribution only

npx supabase functions deploy generate-deck
npx supabase functions deploy suggest-choice
npx supabase functions deploy create-checkout-session
npx supabase functions deploy create-portal-session
npx supabase functions deploy stripe-webhook
```

`stripe-webhook` must be reachable without a Supabase token, because Stripe has
none to send. `config.toml` sets `verify_jwt = false` for it, and the CLI reads that
on deploy. If you deploy it another way, pass `--no-verify-jwt`, or every
delivery comes back 401 and Stripe eventually disables the endpoint.

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected by the platform;
they do not need setting.

The SQL these depend on is in `supabase/migrations/`, and in `schema.sql` for a
fresh project:

- `0002_usage_counters.sql` adds `usage_counters`, `spend_upload`, `refund_upload`.
  Without it every generation fails on the allowance check.
- `0003_subscriptions.sql` adds `subscriptions`, `stripe_events` and
  `claim_stripe_event`. Without it every webhook delivery fails and nobody's
  payment reaches their account.

Apply them before deploying.

## Running locally

```bash
npx supabase start
npx supabase functions serve --env-file supabase/.env.local
```

Then point the web app at it with `VITE_SUPABASE_FUNCTIONS_URL=http://localhost:54321`,
which leaves accounts and sync on the hosted project.

## Keys and tax

The setup above uses a secret key (`sk_`) for brevity, but a
[restricted key](https://docs.stripe.com/keys/restricted-api-keys.md) (`rk_`)
is the better choice: these functions need write access to Checkout Sessions,
Customers and Billing Portal Sessions, and read access to Subscriptions, and
nothing else. A restricted key with only those permissions can do far less
damage if it leaks than one that can move money anywhere.

Nothing here calculates tax. If you sell to customers in the US or EU you will
need to consider [Stripe Tax](https://docs.stripe.com/billing/taxes/collect-taxes.md)
alongside Billing, and note that enabling `automatic_tax` collects nothing
until you also hold an active tax registration.

## Tests

The parts worth testing are pure and run under the repo's normal `npm test`:
`_shared/__tests__/edgeContract.test.ts` covers the request clamping, and fails
the build if the plan limits or model catalogue here drift from the app's own
copies in `packages/core`.
