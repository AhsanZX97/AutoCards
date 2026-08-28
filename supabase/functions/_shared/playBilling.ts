import type { Plan } from './plans.ts';

/**
 * What a Google Play purchase entitles someone to.
 *
 * The Deno-side counterpart to `billing.ts`, kept apart from the function
 * that calls the Android Publisher API so the rules can be read and tested on
 * their own. `verify-play-purchase` is what actually calls Google; this is
 * what decides what the answer means.
 */

/**
 * Product ids, by the plan they sell. Read from the environment for the same
 * reason `readPriceMap` is: a plan with no product id configured cannot be
 * bought. Mirrors `PLAY_PRODUCT_IDS` in
 * `packages/core/src/services/billing/types.ts` — Deno cannot import that
 * package, so the two are kept honest by `edgeContract.test.ts`.
 */
export function readPlayProductMap(get: (key: string) => string | undefined): Record<string, Plan> {
  const map: Record<string, Plan> = {};
  const pro = get('GOOGLE_PLAY_PRODUCT_PRO')?.trim();
  const lifetime = get('GOOGLE_PLAY_PRODUCT_LIFETIME')?.trim();
  if (pro) map[pro] = 'pro';
  if (lifetime) map[lifetime] = 'lifetime';
  return map;
}

/**
 * The plan a product id sells. Unrecognised reads as `free`, not as a guess —
 * a purchase token for a product this deployment does not know about must not
 * hand out an upgrade.
 */
export function planForProduct(productId: string, products: Record<string, Plan>): Plan {
  return products[productId] ?? 'free';
}

/**
 * Subscription states that keep the benefits — Play's counterpart to
 * `ENTITLED_STATUSES` in `billing.ts`. `IN_GRACE_PERIOD` is Play's version of
 * Stripe's `past_due`: a card being retried, not a decision to leave.
 * Anything else — on hold, canceled, expired, paused, pending an initial
 * payment, or a state this deployment has never seen — fails closed.
 */
const ENTITLED_SUBSCRIPTION_STATES = new Set([
  'SUBSCRIPTION_STATE_ACTIVE',
  'SUBSCRIPTION_STATE_IN_GRACE_PERIOD',
]);

export function entitledFromSubscriptionState(state: string): boolean {
  return ENTITLED_SUBSCRIPTION_STATES.has(state);
}

/** The shape this app cares about, lifted out of a `purchases.subscriptionsv2.get` response. */
export interface PlaySubscriptionFacts {
  productId: string;
  state: string;
  expiryTime: string | undefined;
  /** False once someone turns auto-renew off — they keep the plan until `expiryTime`. Defaults true: absent means Google has not said otherwise. */
  autoRenewEnabled: boolean;
  /**
   * Set when this token replaced an earlier one on the same subscription
   * (an upgrade, downgrade, or a renewal after account hold). Not acted on
   * yet, but worth keeping on the row for support to trace a chain of tokens
   * back to the original purchase.
   */
  linkedPurchaseToken: string | undefined;
}

export function readPlaySubscription(raw: unknown): PlaySubscriptionFacts | undefined {
  if (!isRecord(raw)) return undefined;
  const state = raw.subscriptionState;
  if (typeof state !== 'string') return undefined;

  const items = Array.isArray(raw.lineItems) ? raw.lineItems : [];
  const first = items.find(isRecord);
  const productId = first?.productId;
  if (typeof productId !== 'string') return undefined;

  const autoRenewingPlan = isRecord(first?.autoRenewingPlan) ? first.autoRenewingPlan : undefined;

  return {
    productId,
    state,
    expiryTime: typeof first?.expiryTime === 'string' ? first.expiryTime : undefined,
    autoRenewEnabled: autoRenewingPlan?.autoRenewEnabled !== false,
    linkedPurchaseToken: typeof raw.linkedPurchaseToken === 'string' ? raw.linkedPurchaseToken : undefined,
  };
}

/**
 * Purchase states for a one-time product, from `purchases.products.get`:
 * `0` purchased, `1` canceled (refunded or charged back), `2` pending
 * (started but not settled, e.g. a pending cash payment). Only `0` entitles.
 */
export function entitledFromPurchaseState(purchaseState: number): boolean {
  return purchaseState === 0;
}

/** The shape this app cares about, lifted out of a `purchases.products.get` response. */
export interface PlayOneTimePurchaseFacts {
  purchaseState: number;
  orderId: string | undefined;
}

export function readPlayOneTimePurchase(raw: unknown): PlayOneTimePurchaseFacts | undefined {
  if (!isRecord(raw)) return undefined;
  const purchaseState = raw.purchaseState;
  if (typeof purchaseState !== 'number') return undefined;
  return {
    purchaseState,
    orderId: typeof raw.orderId === 'string' ? raw.orderId : undefined,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
