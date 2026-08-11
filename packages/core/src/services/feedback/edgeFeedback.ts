import { edgeErrorMessage, edgeHeaders, functionUrl, type EdgeConfig } from '../edgeConfig';
import type { FeedbackService } from './types';

/**
 * Relays feedback through `send-feedback`, the only thing on this project
 * that is allowed to actually send the mail.
 */
export class EdgeFeedbackService implements FeedbackService {
  constructor(private readonly config: EdgeConfig) {}

  async send(message: string): Promise<void> {
    const token = await this.config.getAccessToken();
    if (!token) {
      throw new Error('Sign in to send feedback.');
    }

    let response: Response;
    try {
      response = await fetch(functionUrl(this.config, 'send-feedback'), {
        method: 'POST',
        headers: edgeHeaders(this.config, token),
        body: JSON.stringify({ message }),
      });
    } catch {
      throw new Error('We could not reach the server just now. Check your connection and try again.');
    }

    if (!response.ok) {
      const payload: unknown = await response.json().catch(() => undefined);
      throw new Error(edgeErrorMessage(payload, 'We could not send that just now. Try again in a moment.'));
    }
  }
}
