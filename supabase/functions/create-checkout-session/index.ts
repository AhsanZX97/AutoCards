import { checkoutMode, isOneTimePlan, ownsOutright, priceForPlan, readPriceMap } from '../_shared/billing.ts';
import { failure, json, preflight } from '../_shared/http.ts';
import { isPlan } from '../_shared/plans.ts';
import { appUrl, stripeClient } from '../_shared/stripe.ts';
import {
  adminClient,
  authenticate,
  customerForUser,
  rememberCustomer,
  subscriptionForUser,
} from '../_shared/supabase.ts';

/** Names this checkout flow in the Stripe dashboard. */
const CHECKOUT_LABEL = 'autocards-plan-qhzlkwtn';

/**
 * Starts a Stripe Checkout session for a paid plan.
 *
 * The client asks for a *plan*, never a price. Prices come from this
 * project's own environment, so a caller cannot name some other price — a
 * cheaper one, a test-mode one, one from another product — and buy a plan for
 * whatever it costs.
 *
 * Nothing here grants anything. The plan changes only when Stripe says the
 * money arrived, in `stripe-webhook`.
 */
Deno.serve(async (request) => {
  const early = preflight(request);
  if (early) return early;
  if (request.method !== 'POST') {
    return failure('Use POST to start a checkout.', 405, 'bad_request');
  }

  let admin: ReturnType<typeof adminClient>;
  let stripe: ReturnType<typeof stripeClient>;
  try {
    admin = adminClient();
    stripe = stripeClient();
  } catch (error) {
    console.error('create-checkout-session is misconfigured', error);
    return failure('Upgrading is not switched on for this app yet.', 500, 'misconfigured');
  }

  const caller = await authenticate(request, admin);
  if (!caller) {
    return failure('Sign in to upgrade.', 401, 'unauthenticated');
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return failure('That request could not be read.', 400, 'bad_request');
  }

  const plan = (body as { plan?: unknown })?.plan;
  if (!isPlan(plan) || plan === 'free') {
    return failure('That is not a plan you can buy.', 400, 'bad_request');
  }

  const price = priceForPlan(plan, readPriceMap((key) => Deno.env.get(key)));
  if (!price) {
    // The plan exists in the app but has no price configured in this
    // deployment's environment — the Stripe product was never created, or the
    // secret was never set.
    return failure('That plan is not on sale yet. Try again shortly.', 400, 'bad_request');
  }

  if (caller.plan === plan) {
    return failure(`You are already on ${plan}.`, 400, 'bad_request');
  }

  try {
    // Reuse the customer if there is one, so someone who cancelled and came
    // back keeps a single billing history instead of collecting duplicates.
    const existing = await subscriptionForUser(admin, caller.id);

    // Nothing is worth selling to someone who already owns the product
    // outright — and taking the money would be worse than refusing it.
    if (ownsOutright(existing?.plan, existing?.subscription_id)) {
      return failure('You already own Auto Cards for life, so there is nothing left to buy.', 400, 'bad_request');
    }

    // The customer is remembered on the profile as soon as one is made, not
    // only once a payment lands. Without that, every abandoned checkout minted
    // a fresh customer and the Stripe dashboard filled up with empty ones.
    let customer = existing?.customer_id ?? (await customerForUser(admin, caller.id));
    if (!customer) {
      customer = (
        await stripe.customers.create({
          ...(caller.email ? { email: caller.email } : {}),
          metadata: { user_id: caller.id },
        })
      ).id;
      await rememberCustomer(admin, caller.id, customer);
    }

    const oneTime = isOneTimePlan(plan);
    const session = await stripe.checkout.sessions.create({
      // Lifetime is a single payment, so it is a `payment` checkout and there
      // is no subscription behind it. Everything downstream — the webhook, the
      // billing panel, the portal — branches on that same fact.
      mode: checkoutMode(plan),
      // Labels this flow in the Stripe dashboard so its conversion can be
      // compared against any other checkout added later. Fixed, not random per
      // call — it names the flow, not the session.
      integration_identifier: CHECKOUT_LABEL,
      customer,
      line_items: [{ price, quantity: 1 }],
      // Both are belt and braces for attributing the purchase later. A
      // subscription carries its own metadata through every lifecycle event;
      // a one-off has only the session, which is why the plan is stamped there
      // too — it is the sole record of what the money bought.
      client_reference_id: caller.id,
      ...(oneTime
        ? {
            metadata: { user_id: caller.id, plan },
            // A subscription bills through invoices on its own. A one-off
            // would leave nothing behind, so the Customer Portal a lifetime
            // buyer opens would be empty of the one thing they came for.
            invoice_creation: { enabled: true },
          }
        : { subscription_data: { metadata: { user_id: caller.id } } }),
      // The plan travels back so the settings page knows what to wait for.
      // Watching only for "no longer free" congratulated a Pro subscriber who
      // had just bought lifetime on being on Pro.
      success_url: `${appUrl()}/app/settings?checkout=success&plan=${plan}`,
      cancel_url: `${appUrl()}/app/settings?checkout=cancelled`,
      allow_promotion_codes: true,
    });

    if (!session.url) {
      throw new Error('Stripe returned a session with no URL');
    }
    return json({ url: session.url });
  } catch (error) {
    console.error('could not start checkout', error);
    return failure('We could not start the checkout just now. Try again in a moment.', 502, 'upstream');
  }
});
