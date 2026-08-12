import type { AccountSubscription } from '../services/account/types';

/**
 * The one line of prose that explains a subscription's state, shared by every
 * client that shows billing — wording only needs to be right once.
 *
 * `lifetime` is bought outright rather than renewed, so it short-circuits
 * before any of the renewal-date phrasing below.
 */
export function describeSubscription(subscription: AccountSubscription): string {
  if (subscription.plan === 'lifetime') {
    return 'Bought outright. There is nothing to renew and nothing to cancel.';
  }

  const ends = subscription.currentPeriodEnd
    ? new Date(subscription.currentPeriodEnd).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : undefined;

  if (subscription.status === 'past_due') {
    return ends
      ? `Your last payment didn’t go through. We’ll keep retrying, and you keep ${subscription.plan} until ${ends}.`
      : 'Your last payment didn’t go through. We’ll keep retrying, and your plan still works in the meantime.';
  }
  if (subscription.cancelAtPeriodEnd) {
    return ends
      ? `Cancelled. You keep ${subscription.plan} until ${ends}, then move back to free.`
      : `Cancelled. You keep ${subscription.plan} until the current period ends.`;
  }
  if (subscription.status === 'active' || subscription.status === 'trialing') {
    return ends ? `Renews on ${ends}.` : 'Active.';
  }
  if (subscription.status === 'canceled') return 'This subscription has ended.';
  return `Status: ${subscription.status}.`;
}
