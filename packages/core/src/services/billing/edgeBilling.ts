import { edgeErrorMessage, edgeHeaders, functionUrl, type EdgeConfig } from '../edgeConfig';
import type { BillingService, PurchasablePlan } from './types';

/**
 * Everything about money, run through our own functions.
 *
 * Both calls do the same thing from here: ask the server for a Stripe URL and
 * hand it back. The client never sees a price, a key or a customer id — what a
 * plan costs and whose billing is whose are decided server-side, so neither is
 * something a caller can propose. Nothing here changes anyone's plan either;
 * that only happens when Stripe reports the payment, in `stripe-webhook`.
 */
export class EdgeBillingService implements BillingService {
  constructor(private readonly config: EdgeConfig) {}

  startCheckout(plan: PurchasablePlan): Promise<string> {
    return this.stripeUrl('create-checkout-session', { plan }, {
      signedOut: 'Sign in to upgrade.',
      unreachable: 'We could not reach checkout just now. Check your connection and try again.',
      failed: 'We could not start the checkout just now. Try again in a moment.',
    });
  }

  openPortal(): Promise<string> {
    return this.stripeUrl('create-portal-session', {}, {
      signedOut: 'Sign in to manage your billing.',
      unreachable: 'We could not reach billing just now. Check your connection and try again.',
      failed: 'We could not open your billing just now. Try again in a moment.',
    });
  }

  /**
   * The shared shape of both calls: authenticate, POST, expect a `url` back.
   * The messages differ because what the user was trying to do differs.
   */
  private async stripeUrl(
    functionName: string,
    body: Record<string, unknown>,
    messages: { signedOut: string; unreachable: string; failed: string },
  ): Promise<string> {
    const token = await this.config.getAccessToken();
    if (!token) {
      throw new Error(messages.signedOut);
    }

    let response: Response;
    try {
      response = await fetch(functionUrl(this.config, functionName), {
        method: 'POST',
        headers: edgeHeaders(this.config, token),
        body: JSON.stringify(body),
      });
    } catch {
      throw new Error(messages.unreachable);
    }

    const payload: unknown = await response.json().catch(() => undefined);

    if (!response.ok) {
      throw new Error(edgeErrorMessage(payload, messages.failed));
    }

    const url = (payload as { url?: unknown } | undefined)?.url;
    if (typeof url !== 'string' || !url) {
      throw new Error('That did not come back with anywhere to go. Try again in a moment.');
    }
    return url;
  }
}
