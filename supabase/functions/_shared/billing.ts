import { isPlan, type Plan } from './plans.ts';

/**
 * What a Stripe subscription entitles someone to.
 *
 * Kept apart from the functions that call Stripe so the rules can be read and
 * tested on their own — this is the logic that decides what somebody paid for,
 * and getting it wrong either gives away the product or takes it from someone
 * who is paid up.
 */

/**
 * Prices, by the plan they sell. Read from the environment rather than
 * hardcoded: the same code serves test-mode and live-mode prices, and they are
 * different ids.
 *
 * A plan with no price configured simply cannot be bought, which is what a
 * deployment that has not created its Stripe products yet looks like.
 */
export function readPriceMap(get: (key: string) => string | undefined): Record<string, Plan> {
  const map: Record<string, Plan> = {};
  const pro = get('STRIPE_PRICE_PRO')?.trim();
  const lifetime = get('STRIPE_PRICE_LIFETIME')?.trim();
  if (pro) map[pro] = 'pro';
  if (lifetime) map[lifetime] = 'lifetime';
  return map;
}

/**
 * Plans paid for once rather than every month.
 *
 * This is the only thing that decides whether a checkout is a subscription or
 * a single payment, and whether the entitlement it creates can ever be taken
 * away. Both follow from the same fact, so both read it from here.
 */
const ONE_TIME_PLANS = new Set<Plan>(['lifetime']);

export function isOneTimePlan(plan: Plan): boolean {
  return ONE_TIME_PLANS.has(plan);
}

/** The Stripe Checkout mode that sells a plan. */
export function checkoutMode(plan: Plan): 'payment' | 'subscription' {
  return isOneTimePlan(plan) ? 'payment' : 'subscription';
}

/** The price that sells a plan, or undefined when that plan is not for sale. */
export function priceForPlan(plan: Plan, prices: Record<string, Plan>): string | undefined {
  return Object.keys(prices).find((price) => prices[price] === plan);
}

/**
 * The plan a price sells.
 *
 * Unknown prices read as `free`, not as a guess. A subscription to something
 * this deployment does not recognise — a price deleted from the map, an event
 * from another environment — must not hand out an upgrade.
 */
export function planForPrice(
  priceId: string | null | undefined,
  prices: Record<string, Plan>,
): Plan {
  if (!priceId) return 'free';
  return prices[priceId] ?? 'free';
}

/**
 * Statuses that keep the benefits.
 *
 * `past_due` is deliberately included. Stripe sets it while it retries a card
 * that failed, which is usually an expired card rather than a decision to
 * leave — cutting access on the first failed charge punishes people mid-term
 * for something their bank did. Stripe moves the subscription to `canceled` or
 * `unpaid` when the retries run out, and that is when access actually stops.
 */
const ENTITLED_STATUSES = new Set(['active', 'trialing', 'past_due']);

/**
 * The plan an account should be on, given the state of its subscription.
 *
 * Anything unrecognised reads as `free`: a status Stripe adds in future should
 * fail closed rather than quietly entitle someone.
 */
export function entitledPlan(status: string, plan: Plan): Plan {
  return ENTITLED_STATUSES.has(status) ? plan : 'free';
}

/**
 * Whether the row already on file is a plan the account owns outright.
 *
 * This is the guard that makes "lifetime" mean it. Someone who was on Pro,
 * bought lifetime, and then let the old subscription lapse will get a
 * `customer.subscription.deleted` for that subscription — and without this,
 * the webhook would dutifully overwrite the single row per account and put a
 * paying customer back on free. A one-off purchase carries no subscription id,
 * so the pair is what identifies it.
 */
export function ownsOutright(plan: unknown, subscriptionId: unknown): boolean {
  return isPlan(plan) && isOneTimePlan(plan) && !subscriptionId;
}

/**
 * Session payment states that mean the money is settled.
 *
 * `no_payment_required` is what a 100%-off promotion code produces. It is a
 * real entitlement — the person completed a checkout we offered them — so it
 * counts alongside a paid one.
 */
const SETTLED_PAYMENTS = new Set(['paid', 'no_payment_required']);

export function paymentSettled(status: string): boolean {
  return SETTLED_PAYMENTS.has(status);
}

/** What a completed one-off checkout tells us, once it is safe to believe. */
export interface PurchaseFacts {
  sessionId: string;
  customerId: string;
  /** Stripe's own `payment_status`, stored verbatim like a subscription's. */
  paymentStatus: string;
  /** The plan our own checkout stamped on the session. */
  plan: Plan;
  userId: string | undefined;
}

/**
 * Reads a completed Checkout Session that bought something outright.
 *
 * The plan comes from metadata this project wrote in
 * `create-checkout-session`, not from anything the buyer could name. Unlike a
 * subscription there are no line items on the event to resolve a price
 * against, and fetching them would still be trusting Stripe to hand back what
 * our own server put there a moment earlier.
 *
 * Returns undefined for anything that is not one of ours — including a
 * subscription checkout, which the subscription branch handles instead.
 */
export function readCheckoutPurchase(raw: unknown): PurchaseFacts | undefined {
  if (!isRecord(raw)) return undefined;
  if (raw.mode !== 'payment') return undefined;

  const id = raw.id;
  const customer = typeof raw.customer === 'string' ? raw.customer : readRecordId(raw.customer);
  if (typeof id !== 'string' || !customer) return undefined;

  const metadata = isRecord(raw.metadata) ? raw.metadata : {};
  const plan = metadata.plan;
  if (!isPlan(plan) || !isOneTimePlan(plan)) return undefined;

  const reference = typeof raw.client_reference_id === 'string' ? raw.client_reference_id : undefined;

  return {
    sessionId: id,
    customerId: customer,
    paymentStatus: typeof raw.payment_status === 'string' ? raw.payment_status : 'unknown',
    plan,
    userId: readMetadataUserId(metadata) ?? (reference || undefined),
  };
}

/**
 * When Stripe says an event happened, as an ISO instant.
 *
 * Undefined for anything without a usable `created`. That is deliberately not
 * treated as "now": an event we cannot date must still be applied, because
 * dropping it would leave somebody who paid on the free plan.
 */
export function eventTimestamp(event: unknown): string | undefined {
  if (!isRecord(event)) return undefined;
  const created = numberOrUndefined(event.created);
  return created === undefined ? undefined : new Date(created * 1000).toISOString();
}

/**
 * The subscription id carried on a `customer.subscription.*` event.
 *
 * This is the only thing read off the event itself — the rest of its payload
 * is not trusted. Stripe does not guarantee delivery order, so an event
 * processed out of turn must still land on the subscription's actual current
 * state, not a snapshot that happened to be attached to whichever event
 * arrived first. The id is only used to know what to re-fetch live.
 */
export function subscriptionEventId(raw: unknown): string | undefined {
  if (!isRecord(raw)) return undefined;
  return typeof raw.id === 'string' ? raw.id : undefined;
}

/** Events worth acting on. Everything else is acknowledged and ignored. */
export const HANDLED_EVENTS = [
  'checkout.session.completed',
  // The follow-up for a one-off paid by something that does not clear on the
  // spot. Without it a bank debit would be taken and never entitle anyone.
  'checkout.session.async_payment_succeeded',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
] as const;

export function isHandled(type: string): boolean {
  return (HANDLED_EVENTS as readonly string[]).includes(type);
}

/** The shape this app cares about, lifted out of a Stripe subscription object. */
export interface SubscriptionFacts {
  subscriptionId: string;
  customerId: string;
  status: string;
  priceId: string | undefined;
  currentPeriodEnd: string | undefined;
  cancelAtPeriodEnd: boolean;
  /** Set at checkout, and the most reliable way back to the account. */
  userId: string | undefined;
}

/**
 * Reads a Stripe subscription defensively.
 *
 * Every field is optional as far as this function is concerned: Stripe's shape
 * varies by API version and by how the object was expanded, and a webhook that
 * throws on a missing field is a webhook that retries forever.
 */
export function readSubscription(raw: unknown): SubscriptionFacts | undefined {
  if (!isRecord(raw)) return undefined;
  const id = raw.id;
  const customer = typeof raw.customer === 'string' ? raw.customer : readRecordId(raw.customer);
  const status = raw.status;
  if (typeof id !== 'string' || !customer || typeof status !== 'string') return undefined;

  const item = firstItem(raw.items);
  const periodEnd = numberOrUndefined(raw.current_period_end) ?? numberOrUndefined(item?.current_period_end);

  return {
    subscriptionId: id,
    customerId: customer,
    status,
    priceId: readRecordId(item?.price),
    currentPeriodEnd: periodEnd === undefined ? undefined : new Date(periodEnd * 1000).toISOString(),
    cancelAtPeriodEnd: raw.cancel_at_period_end === true,
    userId: readMetadataUserId(raw.metadata),
  };
}

function firstItem(items: unknown): Record<string, unknown> | undefined {
  if (!isRecord(items)) return undefined;
  const data = items.data;
  if (!Array.isArray(data) || data.length === 0) return undefined;
  return isRecord(data[0]) ? data[0] : undefined;
}

/** Stripe sends either an id string or the expanded object. */
function readRecordId(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (isRecord(value) && typeof value.id === 'string') return value.id;
  return undefined;
}

function readMetadataUserId(metadata: unknown): string | undefined {
  if (!isRecord(metadata)) return undefined;
  return typeof metadata.user_id === 'string' && metadata.user_id ? metadata.user_id : undefined;
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
