import type { SupabaseClient } from '@supabase/supabase-js';
import type { AnalyticsReport } from '../../types';
import { AnalyticsError, type AnalyticsBackend, type AnalyticsQuery } from './types';

/** Matches the clamp inside `admin_analytics`, so the two never disagree. */
const MIN_DAYS = 1;
const MAX_DAYS = 365;
const DEFAULT_DAYS = 7;

/**
 * Reads the whole report in one call to `admin_analytics`.
 *
 * A plain query would not work here whatever the caller's role: every policy in
 * this schema is `owner_id = auth.uid()`, so the same select from the browser
 * returns the caller's own rows and reads as "one user, no activity". The
 * function is security definer and checks `profiles.is_admin` itself — which is
 * also the check that matters. Hiding the nav link is presentation; this is the
 * gate.
 */
export class SupabaseAnalyticsBackend implements AnalyticsBackend {
  constructor(private readonly client: SupabaseClient) {}

  async fetch(query: AnalyticsQuery = {}): Promise<AnalyticsReport> {
    const days = Math.min(Math.max(Math.round(query.days ?? DEFAULT_DAYS), MIN_DAYS), MAX_DAYS);
    const { data, error } = await this.client.rpc('admin_analytics', {
      p_days: days,
      p_tz: query.timeZone?.trim() || 'UTC',
    });

    if (error) {
      // The refusal is a raised exception, so it arrives as an ordinary error
      // and has to be told apart from the project being down — one means "not
      // your dashboard", the other means "try again".
      const message = error.message ?? '';
      if (/administrator/i.test(message)) {
        throw new AnalyticsError('This account is not an administrator.', 'forbidden');
      }
      throw new AnalyticsError(message || 'The analytics could not be read.', 'unavailable');
    }

    // No error and no payload means the function is not there to answer —
    // treat it as unreachable rather than rendering a dashboard of zeroes.
    if (!data) {
      throw new AnalyticsError('The analytics function returned nothing.', 'unavailable');
    }

    return data as AnalyticsReport;
  }
}
