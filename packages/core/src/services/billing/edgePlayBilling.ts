import type { Plan } from '../../types';
import { edgeErrorMessage, edgeHeaders, functionUrl, type EdgeConfig } from '../edgeConfig';
import type { PlayBillingService, PlayPurchaseInput } from './types';

/**
 * Confirms a Google Play purchase with our own server, which is the only
 * thing that can ask Google whether a purchase token is real.
 *
 * Mirrors `EdgeBillingService`: the client never decides what plan it gets —
 * it hands over what Play gave it and is told what that bought.
 */
export class EdgePlayBillingService implements PlayBillingService {
  constructor(private readonly config: EdgeConfig) {}

  async verifyPurchase(input: PlayPurchaseInput): Promise<Plan> {
    const token = await this.config.getAccessToken();
    if (!token) {
      throw new Error('Sign in to finish this purchase.');
    }

    let response: Response;
    try {
      response = await fetch(functionUrl(this.config, 'verify-play-purchase'), {
        method: 'POST',
        headers: edgeHeaders(this.config, token),
        body: JSON.stringify(input),
      });
    } catch {
      throw new Error('We could not reach checkout just now. Check your connection and try again.');
    }

    const payload: unknown = await response.json().catch(() => undefined);

    if (!response.ok) {
      throw new Error(edgeErrorMessage(payload, 'We could not confirm that purchase just now. Try again in a moment.'));
    }

    const plan = (payload as { plan?: unknown } | undefined)?.plan;
    if (plan !== 'free' && plan !== 'pro' && plan !== 'lifetime') {
      throw new Error('We could not confirm that purchase just now. Try again in a moment.');
    }
    return plan;
  }
}
