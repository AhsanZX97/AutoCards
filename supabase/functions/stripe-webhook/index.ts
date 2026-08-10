import {
  entitledPlan,
  eventTimestamp,
  isHandled,
  isStaleEvent,
  ownsOutright,
  paymentSettled,
  planForPrice,
  readCheckoutPurchase,
  readPriceMap,
  readSubscription,
  type PurchaseFacts,
  type SubscriptionFacts,
} from '../_shared/billing.ts';
import { cryptoProvider, stripeClient, webhookSecret } from '../_shared/stripe.ts';
import {
  adminClient,
  applySubscription,
  claimStripeEvent,
  releaseStripeEvent,
  subscriptionForUser,
  userForCustomer,
} from '../_shared/supabase.ts';
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

/**
 * The only thing in this app that can move an account onto a paid plan.
 *
 * It is unauthenticated by design — Stripe has no Supabase token — so the
 * signature is what stands in for auth. `verify_jwt = false` for this function
 * in `config.toml`; without that, Stripe's calls never reach this code.
 *
 * Two properties matter more than anything else here:
 *
 *   - It must be safe to run twice. Stripe retries until it gets a 2xx and
 *     redelivers on its own schedule, so every event id is claimed before it
 *     is applied, and given back if applying it failed.
 *   - It must fail loudly. Anything it cannot apply returns a 5xx so Stripe
 *     keeps trying, rather than quietly leaving someone who paid on the free
 *     plan.
 */
Deno.serve(async (request) => {
  if (request.method !== 'POST') {
    return new Response('Use POST.', { status: 405 });
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return new Response('Missing signature.', { status: 400 });
  }

  let admin: SupabaseClient;
  let stripe: ReturnType<typeof stripeClient>;
  let secret: string;
  try {
    admin = adminClient();
    stripe = stripeClient();
    secret = webhookSecret();
  } catch (error) {
    console.error('stripe-webhook is misconfigured', error);
    return new Response('Not configured.', { status: 500 });
  }

  // The raw text, not the parsed body: the signature covers the exact bytes
  // Stripe sent, and re-serialising JSON would not reproduce them.
  const raw = await request.text();

  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(raw, signature, secret, undefined, cryptoProvider);
  } catch (error) {
    // Either someone is posting here who is not Stripe, or the signing secret
    // is the wrong one. Both are a 400, and neither should be retried.
    console.error('rejected a webhook with a bad signature', error);
    return new Response('Bad signature.', { status: 400 });
  }

  if (!isHandled(event.type)) {
    // Acknowledged so Stripe stops sending it, but nothing to do.
    return new Response(JSON.stringify({ received: true, handled: false }), { status: 200 });
  }

  let claimed: boolean;
  try {
    claimed = await claimStripeEvent(admin, event.id, event.type);
  } catch (error) {
    console.error('could not claim the event', error);
    return new Response('Could not record the event.', { status: 500 });
  }
  if (!claimed) {
    return new Response(JSON.stringify({ received: true, duplicate: true }), { status: 200 });
  }

  try {
    await handle(admin, stripe, event);
    return new Response(JSON.stringify({ received: true }), { status: 200 });
  } catch (error) {
    // Hand the id back so Stripe's retry is not mistaken for a duplicate.
    await releaseStripeEvent(admin, event.id);
    console.error('could not apply the event', { id: event.id, type: event.type, error });
    return new Response('Could not apply the event.', { status: 500 });
  }
});

async function handle(
  admin: SupabaseClient,
  stripe: ReturnType<typeof stripeClient>,
  event: { type: string; data: { object: unknown } },
): Promise<void> {
  // When Stripe says this happened, carried through so a delivery that arrived
  // out of order can be recognised as older than what is already on file.
  const occurredAt = eventTimestamp(event);

  if (
    event.type === 'checkout.session.completed' ||
    event.type === 'checkout.session.async_payment_succeeded'
  ) {
    const session = event.data.object as {
      client_reference_id?: string | null;
      subscription?: string | { id: string } | null;
    };

    // A lifetime purchase arrives here and nowhere else: there is no
    // subscription, so none of the `customer.subscription.*` events will ever
    // mention it. This one event is the whole of what we are told.
    const purchase = readCheckoutPurchase(event.data.object);
    if (purchase) {
      await grant(admin, purchase, occurredAt);
      return;
    }

    const subscriptionId =
      typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
    if (!subscriptionId) {
      // An incomplete session, or a one-off that was not one of ours —
      // nothing to entitle.
      return;
    }
    // The session carries only the subscription's id, so the subscription
    // itself has to be fetched to know what was actually bought.
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    await apply(admin, subscription, session.client_reference_id ?? undefined, occurredAt);
    return;
  }

  // customer.subscription.created / updated / deleted all carry the
  // subscription itself, including the cancelled state — `deleted` arrives
  // with status 'canceled', which reads as no entitlement like any other.
  await apply(admin, event.data.object, undefined, occurredAt);
}

/**
 * Applies a plan somebody bought outright.
 *
 * Written into the same single row a subscription would use, with no
 * subscription id and no period end — that pair is what `ownsOutright` reads
 * to know this entitlement has no expiry and must not be revoked.
 */
async function grant(
  admin: SupabaseClient,
  purchase: PurchaseFacts,
  occurredAt: string | undefined,
): Promise<void> {
  if (!paymentSettled(purchase.paymentStatus)) {
    // A bank debit that has not cleared. Stripe follows up with
    // `checkout.session.async_payment_succeeded`, and that is when it counts.
    return;
  }

  const userId = purchase.userId ?? (await userForCustomer(admin, purchase.customerId));
  if (!userId) {
    console.error('no account matches this purchase', {
      session: purchase.sessionId,
      customer: purchase.customerId,
    });
    return;
  }

  await applySubscription(
    admin,
    {
      user_id: userId,
      customer_id: purchase.customerId,
      subscription_id: null,
      status: purchase.paymentStatus,
      price_id: null,
      plan: purchase.plan,
      current_period_end: null,
      cancel_at_period_end: false,
      last_event_at: occurredAt ?? null,
    },
    purchase.plan,
  );
}

async function apply(
  admin: SupabaseClient,
  rawSubscription: unknown,
  userIdHint: string | undefined,
  occurredAt: string | undefined,
): Promise<void> {
  const facts: SubscriptionFacts | undefined = readSubscription(rawSubscription);
  if (!facts) {
    console.error('a subscription event carried nothing usable');
    return;
  }

  // Three ways back to the account, in descending order of trust: what
  // checkout stamped on the subscription, what the session said, and the
  // customer we already have on file.
  const userId =
    facts.userId ?? userIdHint ?? (await userForCustomer(admin, facts.customerId));
  if (!userId) {
    // Nothing to attribute it to. Throwing would have Stripe retry forever
    // over a subscription that was never ours, so this is logged and dropped.
    console.error('no account matches this subscription', {
      subscription: facts.subscriptionId,
      customer: facts.customerId,
    });
    return;
  }

  // There is one row per account, so a subscription event would otherwise
  // overwrite a lifetime purchase — and a Pro subscription cancelled after
  // buying lifetime arrives as exactly that, taking the plan from someone who
  // paid for it permanently.
  const existing = await subscriptionForUser(admin, userId);
  if (ownsOutright(existing?.plan, existing?.subscription_id)) {
    console.log('ignored a subscription event for an account that owns its plan outright', {
      user: userId,
      subscription: facts.subscriptionId,
    });
    return;
  }

  // Stripe guarantees delivery, not order. An update held up in a retry can
  // land after a newer one, and applying it would roll the account back to a
  // state it has already left — cancelling someone who has resubscribed, or
  // restoring a plan they just dropped.
  if (isStaleEvent(existing?.last_event_at, occurredAt)) {
    console.log('ignored a Stripe event older than the one already applied', {
      user: userId,
      subscription: facts.subscriptionId,
      applied: existing?.last_event_at,
      arrived: occurredAt,
    });
    return;
  }

  const purchased = planForPrice(facts.priceId, readPriceMap((key) => Deno.env.get(key)));
  const entitlement = entitledPlan(facts.status, purchased);

  await applySubscription(
    admin,
    {
      user_id: userId,
      customer_id: facts.customerId,
      subscription_id: facts.subscriptionId,
      status: facts.status,
      price_id: facts.priceId ?? null,
      plan: purchased,
      current_period_end: facts.currentPeriodEnd ?? null,
      cancel_at_period_end: facts.cancelAtPeriodEnd,
      last_event_at: occurredAt ?? null,
    },
    entitlement,
  );
}
