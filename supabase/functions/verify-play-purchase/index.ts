import { isOneTimePlan, ownsOutright } from '../_shared/billing.ts';
import { getOneTimeProductPurchase, getSubscriptionPurchase } from '../_shared/googlePlay.ts';
import { failure, json, preflight } from '../_shared/http.ts';
import {
  entitledFromPurchaseState,
  entitledFromSubscriptionState,
  planForProduct,
  readPlayOneTimePurchase,
  readPlaySubscription,
  readPlayProductMap,
} from '../_shared/playBilling.ts';
import { adminClient, applySubscription, authenticate, subscriptionForUser } from '../_shared/supabase.ts';

/**
 * Confirms a Google Play purchase and grants the plan it paid for.
 *
 * Unlike Stripe's webhook, this is called by the app itself right after
 * expo-iap reports a purchase — so it is authenticated (we already
 * know whose account this is) and synchronous (the app is waiting to hear
 * what it bought). Nothing here trusts the client past the purchase token:
 * the plan granted is always read back from Google, never from what the
 * request claims to have bought.
 */
Deno.serve(async (request) => {
  const early = preflight(request);
  if (early) return early;
  if (request.method !== 'POST') {
    return failure('Use POST to verify a purchase.', 405, 'bad_request');
  }

  let admin: ReturnType<typeof adminClient>;
  try {
    admin = adminClient();
  } catch (error) {
    console.error('verify-play-purchase is misconfigured', error);
    return failure('Purchases are not switched on for this app yet.', 500, 'misconfigured');
  }

  const caller = await authenticate(request, admin);
  if (!caller) {
    return failure('Sign in to finish this purchase.', 401, 'unauthenticated');
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return failure('That request could not be read.', 400, 'bad_request');
  }

  const productId = (body as { productId?: unknown })?.productId;
  const purchaseToken = (body as { purchaseToken?: unknown })?.purchaseToken;
  if (typeof productId !== 'string' || !productId || typeof purchaseToken !== 'string' || !purchaseToken) {
    return failure('That does not look like a purchase.', 400, 'bad_request');
  }

  const products = readPlayProductMap((key) => Deno.env.get(key));
  const plan = planForProduct(productId, products);
  if (plan === 'free') {
    return failure('That is not a product this app sells.', 400, 'bad_request');
  }

  try {
    const existing = await subscriptionForUser(admin, caller.id);

    // Owning it outright already — nothing Play reports can take that away
    // or needs re-granting. Mirrors the same guard in `stripe-webhook`.
    if (ownsOutright(existing?.plan, existing?.subscription_id)) {
      return json({ plan: 'lifetime' });
    }

    if (isOneTimePlan(plan)) {
      const raw = await getOneTimeProductPurchase(productId, purchaseToken);
      const facts = readPlayOneTimePurchase(raw);
      if (!facts || !entitledFromPurchaseState(facts.purchaseState)) {
        return failure('Google has not confirmed that purchase yet. Try again in a moment.', 400, 'bad_request');
      }

      await applySubscription(
        admin,
        {
          user_id: caller.id,
          provider: 'google_play',
          customer_id: purchaseToken,
          subscription_id: null,
          status: 'purchased',
          price_id: productId,
          plan: 'lifetime',
          current_period_end: null,
          cancel_at_period_end: false,
          last_event_at: new Date().toISOString(),
        },
        'lifetime',
      );
      return json({ plan: 'lifetime' });
    }

    const raw = await getSubscriptionPurchase(purchaseToken);
    const facts = readPlaySubscription(raw);
    if (!facts || facts.productId !== productId) {
      return failure('Google does not recognise that purchase.', 400, 'bad_request');
    }

    const entitled = entitledFromSubscriptionState(facts.state) ? plan : 'free';

    await applySubscription(
      admin,
      {
        user_id: caller.id,
        provider: 'google_play',
        customer_id: purchaseToken,
        subscription_id: purchaseToken,
        status: facts.state,
        price_id: productId,
        plan,
        current_period_end: facts.expiryTime ?? null,
        cancel_at_period_end: !facts.autoRenewEnabled,
        last_event_at: new Date().toISOString(),
      },
      entitled,
    );
    return json({ plan: entitled });
  } catch (error) {
    console.error('could not verify a Play purchase', { user: caller.id, productId, error });
    return failure('We could not confirm that purchase just now. Try again in a moment.', 502, 'upstream');
  }
});
