import type { Plan } from '../../types';

/** A plan someone can actually buy. `free` is what you get by not buying one. */
export type PurchasablePlan = Exclude<Plan, 'free'>;

/**
 * Google Play product ids, by the plan they sell — what the mobile app asks
 * expo-iap to buy.
 *
 * `pro` is a subscription (one base plan, `monthly`); `lifetime` is a
 * one-time product. The server never trusts these: it reads its own copy from
 * `GOOGLE_PLAY_PRODUCT_PRO`/`GOOGLE_PLAY_PRODUCT_LIFETIME` in
 * `supabase/functions/_shared/playBilling.ts`, the same way Stripe's price ids
 * are read from the environment rather than hardcoded. Change a value here
 * only alongside both the matching Play Console product id and that env var.
 */
export const PLAY_PRODUCT_IDS: Record<PurchasablePlan, string> = {
  pro: 'pro_monthly',
  lifetime: 'lifetime',
};

export interface BillingService {
  /**
   * Starts a checkout for `plan` and returns the URL to send the user to.
   *
   * Returning the URL rather than navigating keeps this free of any assumption
   * about where it runs — the web app assigns `location.href`, and a mobile
   * caller would open a browser instead.
   */
  startCheckout(plan: PurchasablePlan): Promise<string>;
  /**
   * Opens Stripe's Customer Portal and returns the URL to send the user to.
   *
   * Cancelling, resuming, changing a card and downloading invoices all happen
   * there rather than in screens of our own — proration, dunning and card
   * authentication are not worth reimplementing badly.
   */
  openPortal(): Promise<string>;
}

/** What expo-iap hands back once Google Play reports a purchase completed. */
export interface PlayPurchaseInput {
  /** One of `PLAY_PRODUCT_IDS`'s values — which plan was bought. */
  productId: string;
  /** The token proving the purchase, checked server-side against Google. */
  purchaseToken: string;
}

/**
 * Verifies a Google Play purchase and grants the plan it paid for.
 *
 * Only mobile implements this — Apple has no equivalent yet, and the web app
 * sells through Stripe Checkout instead, via `BillingService`. Verification
 * has to happen server-side: a purchase token is only proof once Google's own
 * API confirms it, never on the client's say-so.
 */
export interface PlayBillingService {
  /** Resolves to the plan now on the account, or throws with a message to show. */
  verifyPurchase(input: PlayPurchaseInput): Promise<Plan>;
}
