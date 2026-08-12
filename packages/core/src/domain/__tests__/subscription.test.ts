import { describe, expect, it } from 'vitest';
import { describeSubscription } from '../subscription';
import type { AccountSubscription } from '../../services/account/types';

function subscription(overrides: Partial<AccountSubscription>): AccountSubscription {
  return { plan: 'pro', status: 'active', cancelAtPeriodEnd: false, ...overrides };
}

const PERIOD_END = '2026-03-15T00:00:00.000Z';
// Formatted the same way describeSubscription does, so the assertion holds regardless of the runtime's locale.
const ENDS = new Date(PERIOD_END).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });

describe('describeSubscription', () => {
  it('says lifetime plans need no renewal, regardless of status', () => {
    expect(describeSubscription(subscription({ plan: 'lifetime', status: 'canceled' }))).toBe(
      'Bought outright. There is nothing to renew and nothing to cancel.',
    );
  });

  it('reports the renewal date for an active subscription', () => {
    expect(describeSubscription(subscription({ status: 'active', currentPeriodEnd: PERIOD_END }))).toBe(
      `Renews on ${ENDS}.`,
    );
  });

  it('falls back to "Active." when there is no renewal date', () => {
    expect(describeSubscription(subscription({ status: 'active' }))).toBe('Active.');
  });

  it('flags a failed payment while still retrying', () => {
    expect(describeSubscription(subscription({ status: 'past_due', currentPeriodEnd: PERIOD_END }))).toBe(
      `Your last payment didn’t go through. We’ll keep retrying, and you keep pro until ${ENDS}.`,
    );
  });

  it('flags a failed payment with no renewal date on file', () => {
    expect(describeSubscription(subscription({ status: 'past_due' }))).toBe(
      'Your last payment didn’t go through. We’ll keep retrying, and your plan still works in the meantime.',
    );
  });

  it('explains a cancellation that keeps the plan until period end', () => {
    expect(
      describeSubscription(subscription({ status: 'active', cancelAtPeriodEnd: true, currentPeriodEnd: PERIOD_END })),
    ).toBe(`Cancelled. You keep pro until ${ENDS}, then move back to free.`);
  });

  it('explains a cancellation with no renewal date on file', () => {
    expect(describeSubscription(subscription({ status: 'active', cancelAtPeriodEnd: true }))).toBe(
      'Cancelled. You keep pro until the current period ends.',
    );
  });

  it('reports a subscription that has already ended', () => {
    expect(describeSubscription(subscription({ status: 'canceled' }))).toBe('This subscription has ended.');
  });

  it('falls back to the raw status for anything unrecognized', () => {
    expect(describeSubscription(subscription({ status: 'incomplete' }))).toBe('Status: incomplete.');
  });
});
