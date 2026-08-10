import Stripe from 'npm:stripe@22.4.0';

/**
 * Pinned rather than left to the account default, so this code always talks to
 * the shape of the API it was written against — an account whose default is
 * bumped in the dashboard must not silently change what these functions
 * receive.
 */
const API_VERSION = '2026-07-29.dahlia';

/**
 * Stripe, wired for Deno.
 *
 * Two pieces of setup are not optional here. The default HTTP client is
 * Node's, which does not exist in this runtime, and signature verification has
 * to go through Web Crypto — the synchronous `constructEvent` cannot, which is
 * why the webhook uses `constructEventAsync` with the provider below.
 */
export function stripeClient(): Stripe {
  const key = Deno.env.get('STRIPE_SECRET_KEY')?.trim();
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set on this project');
  return new Stripe(key, {
    apiVersion: API_VERSION,
    httpClient: Stripe.createFetchHttpClient(),
  });
}

export const cryptoProvider = Stripe.createSubtleCryptoProvider();

export function webhookSecret(): string {
  const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET')?.trim();
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET is not set on this project');
  return secret;
}

/** Where Stripe sends people back to. */
export function appUrl(): string {
  return (Deno.env.get('APP_URL') ?? 'http://localhost:5173').replace(/\/+$/, '');
}

export type { Stripe };
