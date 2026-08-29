import { describe, expect, it } from 'vitest';
import { PLAN_LIMITS } from '../../types';
import { createTranslator } from '../../i18n';
import { pricingPlans, PLAN_PRICES } from '../pricing';

const t = createTranslator('en');

describe('pricingPlans', () => {
  it('returns free, pro and lifetime in the order they are sold', () => {
    expect(pricingPlans(t).map((plan) => plan.plan)).toEqual(['free', 'pro', 'lifetime']);
  });

  it('marks only pro as the recommended tier', () => {
    expect(pricingPlans(t).filter((plan) => plan.highlight).map((plan) => plan.plan)).toEqual(['pro']);
  });

  it('prices each plan from PLAN_PRICES', () => {
    for (const plan of pricingPlans(t)) {
      expect(plan.price).toBe(PLAN_PRICES[plan.plan]);
    }
  });

  it('advertises the deck limit the app actually enforces', () => {
    const free = pricingPlans(t).find((plan) => plan.plan === 'free');
    expect(free?.features).toContain(`${PLAN_LIMITS.free.maxDecks} decks`);
  });

  it('says unlimited rather than Infinity where there is no limit', () => {
    const joined = pricingPlans(t)
      .flatMap((plan) => plan.features)
      .join(' ');
    expect(joined).not.toContain('Infinity');
    expect(joined).toContain('Unlimited');
  });

  it('does not repeat pro lines under lifetime, which says "everything in Pro" instead', () => {
    const plans = pricingPlans(t);
    const pro = plans.find((plan) => plan.plan === 'pro')?.features ?? [];
    const lifetime = plans.find((plan) => plan.plan === 'lifetime')?.features ?? [];
    expect(lifetime[0]).toBe('Everything in Pro');
    expect(lifetime.filter((feature) => pro.includes(feature))).toEqual([]);
  });

  it('translates the copy while leaving the plan names alone', () => {
    const spanish = pricingPlans(createTranslator('es'));
    expect(spanish.map((plan) => plan.name)).toEqual(['Free', 'Pro', 'Lifetime']);
    expect(spanish[0]?.description).not.toBe(pricingPlans(t)[0]?.description);
  });
});
