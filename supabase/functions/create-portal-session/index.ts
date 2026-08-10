import { failure, json, preflight } from '../_shared/http.ts';
import { appUrl, stripeClient } from '../_shared/stripe.ts';
import { adminClient, authenticate, subscriptionForUser } from '../_shared/supabase.ts';

/**
 * Opens Stripe's Customer Portal for the signed-in account.
 *
 * Cancelling, resuming, updating a card and downloading invoices all live
 * there. Building those screens here would mean handling proration, dunning
 * and card authentication ourselves, and getting any of it wrong takes money
 * from someone or fails to.
 *
 * The customer id comes from our own `subscriptions` row, never from the
 * request — otherwise anyone could open anyone else's billing.
 */
Deno.serve(async (request) => {
  const early = preflight(request);
  if (early) return early;
  if (request.method !== 'POST') {
    return failure('Use POST to open the billing portal.', 405, 'bad_request');
  }

  let admin: ReturnType<typeof adminClient>;
  let stripe: ReturnType<typeof stripeClient>;
  try {
    admin = adminClient();
    stripe = stripeClient();
  } catch (error) {
    console.error('create-portal-session is misconfigured', error);
    return failure('Billing is not switched on for this app yet.', 500, 'misconfigured');
  }

  const caller = await authenticate(request, admin);
  if (!caller) {
    return failure('Sign in to manage your billing.', 401, 'unauthenticated');
  }

  const subscription = await subscriptionForUser(admin, caller.id);
  if (!subscription) {
    return failure('There is no subscription on this account yet.', 400, 'bad_request');
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: subscription.customer_id,
      return_url: `${appUrl()}/app/settings`,
    });
    return json({ url: session.url });
  } catch (error) {
    // The usual cause of a failure here is the portal never having been saved
    // in the Stripe dashboard — it needs its settings configured once per mode
    // before any session can be created.
    console.error('could not open the billing portal', error);
    return failure('We could not open your billing just now. Try again in a moment.', 502, 'upstream');
  }
});
