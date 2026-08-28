import { describe, expect, it } from 'vitest';
import {
  entitledFromPurchaseState,
  entitledFromSubscriptionState,
  planForProduct,
  readPlayOneTimePurchase,
  readPlaySubscription,
  readPlayProductMap,
} from '../playBilling';

const PRODUCTS = { pro_monthly: 'pro', lifetime: 'lifetime' } as const;

describe('readPlayProductMap', () => {
  it('maps each configured product id to the plan it sells', () => {
    const env: Record<string, string> = {
      GOOGLE_PLAY_PRODUCT_PRO: 'pro_monthly',
      GOOGLE_PLAY_PRODUCT_LIFETIME: 'lifetime',
    };
    expect(readPlayProductMap((key) => env[key])).toEqual(PRODUCTS);
  });

  it('leaves out a plan with no product id, so it cannot be bought', () => {
    const env: Record<string, string> = { GOOGLE_PLAY_PRODUCT_PRO: 'pro_monthly' };
    expect(readPlayProductMap((key) => env[key])).toEqual({ pro_monthly: 'pro' });
  });

  it('ignores a product id set to whitespace', () => {
    expect(readPlayProductMap(() => '   ')).toEqual({});
  });
});

describe('planForProduct', () => {
  it('resolves a configured product id to its plan', () => {
    expect(planForProduct('lifetime', PRODUCTS)).toBe('lifetime');
  });

  it('reads an unrecognised product id as free, not as a guess', () => {
    expect(planForProduct('some_other_sku', PRODUCTS)).toBe('free');
  });
});

describe('entitledFromSubscriptionState', () => {
  it('keeps the benefits while active or in a payment grace period', () => {
    expect(entitledFromSubscriptionState('SUBSCRIPTION_STATE_ACTIVE')).toBe(true);
    expect(entitledFromSubscriptionState('SUBSCRIPTION_STATE_IN_GRACE_PERIOD')).toBe(true);
  });

  it('drops entitlement once payment retries run out or the plan ends', () => {
    expect(entitledFromSubscriptionState('SUBSCRIPTION_STATE_ON_HOLD')).toBe(false);
    expect(entitledFromSubscriptionState('SUBSCRIPTION_STATE_CANCELED')).toBe(false);
    expect(entitledFromSubscriptionState('SUBSCRIPTION_STATE_EXPIRED')).toBe(false);
    expect(entitledFromSubscriptionState('SUBSCRIPTION_STATE_PAUSED')).toBe(false);
    expect(entitledFromSubscriptionState('SUBSCRIPTION_STATE_PENDING')).toBe(false);
  });

  it('fails closed on a state it has never seen', () => {
    expect(entitledFromSubscriptionState('SOME_FUTURE_STATE')).toBe(false);
  });
});

describe('readPlaySubscription', () => {
  it('reads the product id and state off a subscriptionsv2 response', () => {
    const raw = {
      subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
      lineItems: [{ productId: 'pro_monthly', expiryTime: '2026-09-09T00:00:00.000Z' }],
      linkedPurchaseToken: 'previous-token',
    };
    expect(readPlaySubscription(raw)).toEqual({
      productId: 'pro_monthly',
      state: 'SUBSCRIPTION_STATE_ACTIVE',
      expiryTime: '2026-09-09T00:00:00.000Z',
      autoRenewEnabled: true,
      linkedPurchaseToken: 'previous-token',
    });
  });

  it('reads auto-renew as off only when Google says so explicitly', () => {
    const raw = {
      subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
      lineItems: [{ productId: 'pro_monthly', autoRenewingPlan: { autoRenewEnabled: false } }],
    };
    expect(readPlaySubscription(raw)?.autoRenewEnabled).toBe(false);
  });

  it('returns undefined for a response with no usable state', () => {
    expect(readPlaySubscription({})).toBeUndefined();
    expect(readPlaySubscription(null)).toBeUndefined();
    expect(readPlaySubscription({ subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE', lineItems: [] })).toBeUndefined();
  });
});

describe('entitledFromPurchaseState', () => {
  it('only a completed purchase entitles', () => {
    expect(entitledFromPurchaseState(0)).toBe(true);
    expect(entitledFromPurchaseState(1)).toBe(false);
    expect(entitledFromPurchaseState(2)).toBe(false);
  });
});

describe('readPlayOneTimePurchase', () => {
  it('reads the purchase state and order id off a products.get response', () => {
    expect(readPlayOneTimePurchase({ purchaseState: 0, orderId: 'GPA.1234' })).toEqual({
      purchaseState: 0,
      orderId: 'GPA.1234',
    });
  });

  it('returns undefined for a response with no usable purchase state', () => {
    expect(readPlayOneTimePurchase({})).toBeUndefined();
    expect(readPlayOneTimePurchase(null)).toBeUndefined();
  });
});
