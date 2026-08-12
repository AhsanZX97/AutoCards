import { PLAN_LIMITS, type Plan, type UploadUsage } from '../types';

/**
 * The monthly PDF allowance, counted and spent.
 *
 * Every path that turns a PDF into cards costs one upload: creating a deck from
 * a document, and adding more cards to a deck from another one. Both go through
 * the same model call and the same money, so both are charged the same way.
 *
 * This is a client-side meter, not an enforcement boundary — the count lives in
 * the same local storage the user can clear. It exists so the app reflects the
 * plan honestly; a paywall that has to hold has to be enforced wherever the
 * OpenRouter key lives.
 */

/** `YYYY-MM` in UTC. Every account rolls over at the same instant. */
export function usagePeriod(now: Date = new Date()): string {
  const month = `${now.getUTCMonth() + 1}`.padStart(2, '0');
  return `${now.getUTCFullYear()}-${month}`;
}

/**
 * The stored count as it applies right now. A record from an earlier month
 * reads as zero, which is how the monthly reset happens without a scheduler.
 */
export function usageForPeriod(usage: UploadUsage | undefined, now: Date = new Date()): UploadUsage {
  const period = usagePeriod(now);
  if (usage?.period === period) return usage;
  return { period, uploads: 0 };
}

/** The count after one more upload, rolling the period over if it is stale. */
export function countUpload(usage: UploadUsage | undefined, now: Date = new Date()): UploadUsage {
  const current = usageForPeriod(usage, now);
  return { period: current.period, uploads: current.uploads + 1 };
}

/** Uploads left this month. `Infinity` on an unlimited plan. */
export function remainingUploads(
  plan: Plan,
  usage: UploadUsage | undefined,
  now: Date = new Date(),
): number {
  const limit = PLAN_LIMITS[plan].monthlyUploads;
  if (limit === Number.POSITIVE_INFINITY) return limit;
  return Math.max(0, limit - usageForPeriod(usage, now).uploads);
}

export function canUpload(plan: Plan, usage: UploadUsage | undefined, now: Date = new Date()): boolean {
  return remainingUploads(plan, usage, now) > 0;
}

/** "3 of 5 uploads left this month" / "12 used this month" once the plan is unlimited. */
export function formatQuota(remaining: number, limit: number, used: number): string {
  if (limit === Number.POSITIVE_INFINITY) return `${used} used this month`;
  return `${remaining} of ${limit} uploads left this month`;
}
