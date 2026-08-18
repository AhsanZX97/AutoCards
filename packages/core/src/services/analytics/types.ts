import type { AnalyticsReport } from '../../types';

/** Why a report could not be read. The page says something different for each. */
export type AnalyticsFailure =
  /** The account is not an admin. The server decides this, not the UI. */
  | 'forbidden'
  /** The function is missing, or the project is unreachable. */
  | 'unavailable';

export class AnalyticsError extends Error {
  constructor(
    message: string,
    readonly reason: AnalyticsFailure,
  ) {
    super(message);
    this.name = 'AnalyticsError';
  }
}

export interface AnalyticsQuery {
  /** Window width in days including today. Defaults to 7. */
  days?: number;
  /** IANA zone the days are cut on. Defaults to UTC. */
  timeZone?: string;
}

/**
 * The owner's cross-account report.
 *
 * Deliberately not a store: nothing else in the app reads it, it is never
 * merged with local state, and it is never persisted — it is a snapshot of the
 * server, fetched when a screen asks and thrown away with it.
 */
export interface AnalyticsBackend {
  fetch(query?: AnalyticsQuery): Promise<AnalyticsReport>;
}
