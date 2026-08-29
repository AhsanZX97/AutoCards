import { PLAN_LIMITS, PLANS, type Plan } from '../types';
import type { Translator } from '../i18n';

/**
 * What each plan costs, in the one place both clients read it from.
 *
 * Display strings rather than numbers: these are marketing copy shown beside
 * a period ("per month", "one-time"), not something we compute with — the
 * amount actually charged is Stripe's price and Google Play's product, never
 * a figure the client sends.
 */
export const PLAN_PRICES: Record<Plan, string> = {
  free: '$0',
  pro: '$4',
  lifetime: '$39',
};

/** Product names, deliberately untranslated — they are what the plan is called everywhere. */
export const PLAN_NAMES: Record<Plan, string> = {
  free: 'Free',
  pro: 'Pro',
  lifetime: 'Lifetime',
};

export interface PricingPlan {
  plan: Plan;
  /** 'Free' / 'Pro' / 'Lifetime'. */
  name: string;
  price: string;
  /** 'forever', 'per month', 'one-time'. */
  period: string;
  description: string;
  features: string[];
  cta: string;
  /** The tier drawn as the recommended one — Pro. */
  highlight: boolean;
}

function formatLimit(t: Translator, value: number): string {
  return value === Number.POSITIVE_INFINITY ? t('landing.pricing.unlimited') : value.toLocaleString();
}

/**
 * The numbers on a pricing card, read from the limits the app actually
 * enforces.
 *
 * Written by hand on the landing page once, and wrong — it advertised five
 * decks and fifty cards each while the code allowed three decks and five
 * generations. That was survivable while nothing was enforced. Now that the
 * server turns people away at these exact numbers, an inflated one here is a
 * promise the product visibly breaks, so there is only one place to change
 * them.
 */
export function planFeatures(t: Translator, plan: Plan): string[] {
  const limits = PLAN_LIMITS[plan];
  return [
    t('landing.pricing.generationsPerMonth', { count: formatLimit(t, limits.monthlyUploads) }),
    t('landing.pricing.decksCount', { count: formatLimit(t, limits.maxDecks) }),
    t('landing.pricing.pagesPerDocument', { count: formatLimit(t, limits.maxPagesPerPdf) }),
  ];
}

/**
 * The lifetime tier's lines, minus anything Pro already advertises.
 *
 * "Everything in Pro" covers those, and a tier that repeats them reads as
 * padding rather than as an upgrade. Still derived from `PLAN_LIMITS` for the
 * reason above — the numbers are not written twice.
 */
function lifetimeFeatures(t: Translator): string[] {
  const pro = new Set(planFeatures(t, 'pro'));
  return planFeatures(t, 'lifetime').filter((feature) => !pro.has(feature));
}

const PERIOD_KEYS = {
  free: 'landing.pricing.forever',
  pro: 'landing.pricing.perMonth',
  lifetime: 'landing.pricing.oneTime',
} as const;

const DESCRIPTION_KEYS = {
  free: 'landing.pricing.free.description',
  pro: 'landing.pricing.pro.description',
  lifetime: 'landing.pricing.lifetime.description',
} as const;

const CTA_KEYS = {
  free: 'landing.pricing.getStarted',
  pro: 'landing.pricing.getPro',
  lifetime: 'landing.pricing.buyLifetime',
} as const;

function featuresFor(t: Translator, plan: Plan): string[] {
  if (plan === 'free') return [...planFeatures(t, 'free'), t('landing.pricing.mobileAppAccess')];
  if (plan === 'pro') {
    return [...planFeatures(t, 'pro'), t('landing.pricing.advancedAnalytics'), t('landing.pricing.fileImports')];
  }
  return [t('landing.pricing.everythingInPro'), ...lifetimeFeatures(t), t('landing.pricing.everyFutureFeature')];
}

/**
 * The three pricing cards, in the order plans are sold, for whichever client
 * is drawing them — the web landing page's table and the mobile walkthrough's
 * plan step. Both show the same prices and the same promises because there is
 * only one description of a plan.
 */
export function pricingPlans(t: Translator): PricingPlan[] {
  return PLANS.map((plan) => ({
    plan,
    name: PLAN_NAMES[plan],
    price: PLAN_PRICES[plan],
    period: t(PERIOD_KEYS[plan]),
    description: t(DESCRIPTION_KEYS[plan]),
    features: featuresFor(t, plan),
    cta: t(CTA_KEYS[plan]),
    highlight: plan === 'pro',
  }));
}
