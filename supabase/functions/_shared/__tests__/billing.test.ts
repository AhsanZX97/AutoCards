import { describe, expect, it } from 'vitest';
import {
  checkoutMode,
  entitledPlan,
  eventTimestamp,
  isHandled,
  isOneTimePlan,
  ownsOutright,
  paymentSettled,
  planForPrice,
  priceForPlan,
  readCheckoutPurchase,
  readPriceMap,
  readSubscription,
  subscriptionEventId,
} from '../billing';

const PRICES = { price_pro_monthly: 'pro', price_lifetime: 'lifetime' } as const;

describe('readPriceMap', () => {
  it('maps each configured price to the plan it sells', () => {
    const env: Record<string, string> = {
      STRIPE_PRICE_PRO: 'price_pro_monthly',
      STRIPE_PRICE_LIFETIME: 'price_lifetime',
    };
    expect(readPriceMap((key) => env[key])).toEqual(PRICES);
  });

  it('leaves out a plan with no price, so it cannot be bought', () => {
    const env: Record<string, string> = { STRIPE_PRICE_PRO: 'price_pro_monthly' };
    const map = readPriceMap((key) => env[key]);

    expect(map).toEqual({ price_pro_monthly: 'pro' });
    expect(priceForPlan('lifetime', map)).toBeUndefined();
  });

  it('ignores a price set to whitespace', () => {
    expect(readPriceMap(() => '   ')).toEqual({});
  });
});

describe('planForPrice', () => {
  it('reads a known price as the plan it sells', () => {
    expect(planForPrice('price_pro_monthly', PRICES)).toBe('pro');
  });

  it('reads a price it does not recognise as free rather than guessing', () => {
    expect(planForPrice('price_from_another_project', PRICES)).toBe('free');
    expect(planForPrice(undefined, PRICES)).toBe('free');
    expect(planForPrice(null, PRICES)).toBe('free');
  });
});

describe('entitledPlan', () => {
  it('gives the plan while the subscription is live', () => {
    expect(entitledPlan('active', 'pro')).toBe('pro');
    expect(entitledPlan('trialing', 'pro')).toBe('pro');
  });

  it('keeps the plan while a failed payment is being retried', () => {
    expect(entitledPlan('past_due', 'pro')).toBe('pro');
  });

  it('takes the plan away once the subscription is over', () => {
    expect(entitledPlan('canceled', 'pro')).toBe('free');
    expect(entitledPlan('unpaid', 'pro')).toBe('free');
    expect(entitledPlan('incomplete_expired', 'pro')).toBe('free');
    expect(entitledPlan('paused', 'pro')).toBe('free');
  });

  it('fails closed on a status it has never seen', () => {
    expect(entitledPlan('something_stripe_added_later', 'pro')).toBe('free');
  });
});

describe('checkoutMode', () => {
  it('sells a subscription plan as a subscription', () => {
    expect(isOneTimePlan('pro')).toBe(false);
    expect(checkoutMode('pro')).toBe('subscription');
  });

  it('sells lifetime as a single payment', () => {
    expect(isOneTimePlan('lifetime')).toBe(true);
    expect(checkoutMode('lifetime')).toBe('payment');
  });
});

describe('ownsOutright', () => {
  it('recognises a plan bought with one payment', () => {
    expect(ownsOutright('lifetime', null)).toBe(true);
    expect(ownsOutright('lifetime', undefined)).toBe(true);
  });

  /**
   * The case this guard exists for: a Pro subscription cancelled after buying
   * lifetime sends `customer.subscription.deleted`, and there is one
   * subscriptions row per account for it to overwrite.
   */
  it('does not mistake a monthly plan for one that was bought', () => {
    expect(ownsOutright('pro', 'sub_123')).toBe(false);
    expect(ownsOutright('pro', null)).toBe(false);
    expect(ownsOutright('free', null)).toBe(false);
  });

  it('refuses a plan name it does not know', () => {
    expect(ownsOutright('team', null)).toBe(false);
    expect(ownsOutright(undefined, null)).toBe(false);
  });
});

describe('paymentSettled', () => {
  it('counts money that has arrived', () => {
    expect(paymentSettled('paid')).toBe(true);
  });

  it('counts a checkout completed with a full discount', () => {
    expect(paymentSettled('no_payment_required')).toBe(true);
  });

  it('waits on anything still clearing', () => {
    expect(paymentSettled('unpaid')).toBe(false);
    expect(paymentSettled('unknown')).toBe(false);
  });
});

describe('readCheckoutPurchase', () => {
  const SESSION = {
    id: 'cs_123',
    mode: 'payment',
    customer: 'cus_123',
    payment_status: 'paid',
    client_reference_id: 'user-uuid',
    metadata: { user_id: 'user-uuid', plan: 'lifetime' },
  };

  it('reads what a one-off checkout bought', () => {
    expect(readCheckoutPurchase(SESSION)).toEqual({
      sessionId: 'cs_123',
      customerId: 'cus_123',
      paymentStatus: 'paid',
      plan: 'lifetime',
      userId: 'user-uuid',
    });
  });

  it('falls back to the client reference when metadata has no user', () => {
    const raw = { ...SESSION, metadata: { plan: 'lifetime' } };
    expect(readCheckoutPurchase(raw)?.userId).toBe('user-uuid');
  });

  it('takes the customer whether it arrives expanded or as an id', () => {
    expect(readCheckoutPurchase({ ...SESSION, customer: { id: 'cus_123' } })?.customerId).toBe('cus_123');
  });

  it('reports a payment that has not cleared rather than hiding it', () => {
    expect(readCheckoutPurchase({ ...SESSION, payment_status: 'unpaid' })?.paymentStatus).toBe('unpaid');
  });

  /**
   * The plan is read from metadata this project wrote, never from anything a
   * buyer could name — a session claiming a plan we did not stamp is not one
   * of ours and entitles nothing.
   */
  it('ignores a session that is not one of ours', () => {
    expect(readCheckoutPurchase({ ...SESSION, mode: 'subscription' })).toBeUndefined();
    expect(readCheckoutPurchase({ ...SESSION, metadata: { user_id: 'user-uuid' } })).toBeUndefined();
    expect(readCheckoutPurchase({ ...SESSION, metadata: { plan: 'pro' } })).toBeUndefined();
    expect(readCheckoutPurchase({ ...SESSION, metadata: { plan: 'enterprise' } })).toBeUndefined();
  });

  it('refuses an object that is not a checkout session', () => {
    expect(readCheckoutPurchase(null)).toBeUndefined();
    expect(readCheckoutPurchase({ mode: 'payment' })).toBeUndefined();
  });
});

describe('isHandled', () => {
  it('acts on checkout and subscription lifecycle events', () => {
    expect(isHandled('checkout.session.completed')).toBe(true);
    expect(isHandled('checkout.session.async_payment_succeeded')).toBe(true);
    expect(isHandled('customer.subscription.updated')).toBe(true);
    expect(isHandled('customer.subscription.deleted')).toBe(true);
  });

  it('ignores everything else', () => {
    expect(isHandled('invoice.paid')).toBe(false);
    expect(isHandled('payment_intent.succeeded')).toBe(false);
  });
});

describe('readSubscription', () => {
  const RAW = {
    id: 'sub_123',
    customer: 'cus_123',
    status: 'active',
    cancel_at_period_end: false,
    current_period_end: 1_800_000_000,
    metadata: { user_id: 'user-uuid' },
    items: { data: [{ price: { id: 'price_pro_monthly' } }] },
  };

  it('lifts out what the app needs to record', () => {
    expect(readSubscription(RAW)).toEqual({
      subscriptionId: 'sub_123',
      customerId: 'cus_123',
      status: 'active',
      priceId: 'price_pro_monthly',
      currentPeriodEnd: new Date(1_800_000_000 * 1000).toISOString(),
      cancelAtPeriodEnd: false,
      userId: 'user-uuid',
    });
  });

  it('takes the customer whether it arrives expanded or as an id', () => {
    expect(readSubscription({ ...RAW, customer: { id: 'cus_123' } })?.customerId).toBe('cus_123');
  });

  it('takes the period end off the item when it is not on the subscription', () => {
    const { current_period_end: _dropped, ...withoutTop } = RAW;
    const raw = {
      ...withoutTop,
      items: { data: [{ price: { id: 'price_pro_monthly' }, current_period_end: 1_800_000_000 }] },
    };
    expect(readSubscription(raw)?.currentPeriodEnd).toBe(new Date(1_800_000_000 * 1000).toISOString());
  });

  it('survives the fields it wants being absent', () => {
    const sparse = readSubscription({ id: 'sub_1', customer: 'cus_1', status: 'active' });
    expect(sparse).toEqual({
      subscriptionId: 'sub_1',
      customerId: 'cus_1',
      status: 'active',
      priceId: undefined,
      currentPeriodEnd: undefined,
      cancelAtPeriodEnd: false,
      userId: undefined,
    });
  });

  it('refuses an object that is not a subscription', () => {
    expect(readSubscription(null)).toBeUndefined();
    expect(readSubscription({ id: 'sub_1' })).toBeUndefined();
    expect(readSubscription({ customer: 'cus_1', status: 'active' })).toBeUndefined();
  });
});

describe('eventTimestamp', () => {
  it('reads Stripe’s unix seconds as an ISO instant', () => {
    expect(eventTimestamp({ created: 1_800_000_000 })).toBe(
      new Date(1_800_000_000 * 1000).toISOString(),
    );
  });

  it('is undefined when the event carries no usable timestamp', () => {
    expect(eventTimestamp({})).toBeUndefined();
    expect(eventTimestamp({ created: 'yesterday' })).toBeUndefined();
    expect(eventTimestamp({ created: Number.NaN })).toBeUndefined();
    expect(eventTimestamp(null)).toBeUndefined();
  });
});

describe('subscriptionEventId', () => {
  it('reads the id off a subscription event', () => {
    expect(subscriptionEventId({ id: 'sub_123', status: 'canceled' })).toBe('sub_123');
  });

  it('refuses an object with no usable id', () => {
    expect(subscriptionEventId(null)).toBeUndefined();
    expect(subscriptionEventId({})).toBeUndefined();
    expect(subscriptionEventId({ id: 42 })).toBeUndefined();
  });
});

