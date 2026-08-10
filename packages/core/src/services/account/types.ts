import type { IsoDate, Plan, UploadUsage } from '../../types';

/**
 * The subscription behind someone's plan, as far as the app needs to show it.
 *
 * Read-only, and read straight from the row the webhook writes. Nothing in the
 * app decides any of this — it is a report of what Stripe last told us.
 */
export interface AccountSubscription {
  /** What was bought. May differ from the account's live plan when a payment lapsed. */
  plan: Plan;
  /** Stripe's own status: `active`, `trialing`, `past_due`, `canceled`… */
  status: string;
  /** When the paid-up period runs out — the renewal date, or the end date if cancelling. */
  currentPeriodEnd?: IsoDate;
  /** True once someone cancels: they keep the plan until `currentPeriodEnd`. */
  cancelAtPeriodEnd: boolean;
}

/**
 * The account's own rows in Postgres, read directly rather than through a
 * function: both tables are readable by their owner under RLS, and neither
 * needs a secret to look at.
 */
export interface AccountBackend {
  /** Null when the account has never subscribed. */
  fetchSubscription(userId: string): Promise<AccountSubscription | null>;
  /**
   * The month's upload count as the server has it. This is the number that
   * decides, so the local meter defers to it.
   */
  fetchUploadUsage(userId: string, period: string): Promise<UploadUsage>;
}
