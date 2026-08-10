import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

/**
 * Who is calling, and what they are entitled to.
 *
 * `plan` is read from `profiles` rather than taken from anything the client
 * sent — the whole point of doing this here is that the caller does not get a
 * say in their own allowance.
 */
export interface Caller {
  id: string;
  plan: string;
  /** Handed to Stripe so a customer is recognisable in the dashboard. */
  email: string | undefined;
}

/**
 * Service-role client. It bypasses RLS, which is what lets it read any
 * profile's plan and move the usage counters — the counters have no write
 * policy precisely so nothing else can.
 */
export function adminClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * Resolves the bearer token to a user and their plan, or null if the token is
 * missing, expired or forged. The gateway already verifies the JWT before the
 * function runs; this is what turns it into an identity we can spend against.
 */
export async function authenticate(
  request: Request,
  admin: SupabaseClient,
): Promise<Caller | null> {
  const header = request.headers.get('Authorization') ?? '';
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  if (!token) return null;

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;

  const profile = await admin.from('profiles').select('plan').eq('id', data.user.id).single();
  // A missing profile row means the sign-up trigger has not caught up. Treat
  // it as the free plan rather than as unlimited.
  return { id: data.user.id, plan: profile.data?.plan ?? 'free', email: data.user.email };
}

/**
 * Spends one upload against this month's allowance, returning the new count —
 * or null when there was nothing left to spend.
 *
 * Reserved before the model call rather than counted after it, so two tabs
 * cannot both spend the last one. `refundUpload` puts it back if the call
 * never reached the model.
 */
export async function spendUpload(
  admin: SupabaseClient,
  userId: string,
  period: string,
  limit: number | null,
): Promise<number | null> {
  const { data, error } = await admin.rpc('spend_upload', {
    p_user: userId,
    p_period: period,
    p_limit: limit,
  });
  if (error) throw new Error(`Could not read the upload allowance: ${error.message}`);
  return typeof data === 'number' ? data : null;
}

/** Best effort — a failed refund must not turn into a second error for the user. */
export async function refundUpload(
  admin: SupabaseClient,
  userId: string,
  period: string,
): Promise<void> {
  const { error } = await admin.rpc('refund_upload', { p_user: userId, p_period: period });
  if (error) console.error('refund_upload failed', { userId, period, error: error.message });
}

/** What this app records about someone's subscription. */
export interface SubscriptionRow {
  user_id: string;
  customer_id: string;
  subscription_id: string | null;
  status: string;
  price_id: string | null;
  plan: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
}

export async function subscriptionForUser(
  admin: SupabaseClient,
  userId: string,
): Promise<SubscriptionRow | undefined> {
  const { data } = await admin.from('subscriptions').select('*').eq('user_id', userId).maybeSingle();
  return (data as SubscriptionRow | null) ?? undefined;
}

/** The way back from a Stripe customer to an account, for events that carry no metadata. */
export async function userForCustomer(
  admin: SupabaseClient,
  customerId: string,
): Promise<string | undefined> {
  const { data } = await admin
    .from('subscriptions')
    .select('user_id')
    .eq('customer_id', customerId)
    .maybeSingle();
  return (data as { user_id: string } | null)?.user_id;
}

/**
 * Writes what Stripe says, and the plan it entitles, in that order.
 *
 * `profiles.plan` is what the rest of the app reads, so it is updated last: if
 * the first write fails, the account keeps the plan it had rather than losing
 * access on a half-applied event that Stripe will retry anyway.
 */
export async function applySubscription(
  admin: SupabaseClient,
  row: SubscriptionRow,
  entitlement: string,
): Promise<void> {
  const saved = await admin
    .from('subscriptions')
    .upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  if (saved.error) throw new Error(`Could not record the subscription: ${saved.error.message}`);

  const profile = await admin.from('profiles').update({ plan: entitlement }).eq('id', row.user_id);
  if (profile.error) throw new Error(`Could not update the plan: ${profile.error.message}`);
}

/**
 * Records an event id, and reports whether it is new. Stripe redelivers, so
 * this is what stops one event being applied twice.
 */
export async function claimStripeEvent(
  admin: SupabaseClient,
  id: string,
  type: string,
): Promise<boolean> {
  const { data, error } = await admin.rpc('claim_stripe_event', { p_id: id, p_type: type });
  if (error) throw new Error(`Could not record the Stripe event: ${error.message}`);
  return data === true;
}

/**
 * Gives the id back after a failed handling, so Stripe's retry is not
 * swallowed as a duplicate.
 */
export async function releaseStripeEvent(admin: SupabaseClient, id: string): Promise<void> {
  const { error } = await admin.from('stripe_events').delete().eq('id', id);
  if (error) console.error('could not release stripe event', { id, error: error.message });
}
