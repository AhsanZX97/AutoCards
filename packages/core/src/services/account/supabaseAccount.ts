import type { SupabaseClient } from '@supabase/supabase-js';
import { PLANS, type Plan, type UploadUsage } from '../../types';
import type { AccountBackend, AccountSubscription } from './types';

interface SubscriptionRow {
  plan: string | null;
  status: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
}

interface UsageRow {
  uploads: number | null;
}

/**
 * Reads what the server knows about an account's plan and allowance.
 *
 * Both tables are owner-readable under RLS and neither is writable from here,
 * so this is a plain query rather than another Edge Function. Every read fails
 * soft: a billing panel that cannot load its subscription should show nothing
 * rather than break the settings page, and a meter that cannot reach the
 * server keeps the count it already had.
 */
export class SupabaseAccountBackend implements AccountBackend {
  constructor(private readonly client: SupabaseClient) {}

  async fetchSubscription(userId: string): Promise<AccountSubscription | null> {
    const { data, error } = await this.client
      .from('subscriptions')
      .select('plan,status,current_period_end,cancel_at_period_end')
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !data) return null;

    const row = data as SubscriptionRow;
    return {
      plan: asPlan(row.plan),
      status: row.status ?? 'unknown',
      ...(row.current_period_end ? { currentPeriodEnd: row.current_period_end } : {}),
      cancelAtPeriodEnd: row.cancel_at_period_end === true,
    };
  }

  async fetchUploadUsage(userId: string, period: string): Promise<UploadUsage> {
    const { data, error } = await this.client
      .from('usage_counters')
      .select('uploads')
      .eq('user_id', userId)
      .eq('period', period)
      .maybeSingle();

    // No row yet is the normal state at the start of a month, and reads the
    // same as a failed query: nothing spent that we know of.
    if (error || !data) return { period, uploads: 0 };
    return { period, uploads: (data as UsageRow).uploads ?? 0 };
  }
}

function asPlan(value: string | null): Plan {
  return (PLANS as readonly string[]).includes(value ?? '') ? (value as Plan) : 'free';
}
