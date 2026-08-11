export interface FeedbackService {
  /** Sends `message` to the team's inbox. Rejects with a message fit to show the user. */
  send(message: string): Promise<void>;
}
