import type { Plan } from '../../types';

/** A plan someone can actually buy. `free` is what you get by not buying one. */
export type PurchasablePlan = Exclude<Plan, 'free'>;

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
