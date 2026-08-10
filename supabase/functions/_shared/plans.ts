/**
 * Plan allowances, as the server enforces them.
 *
 * A deliberate second copy of `PLAN_LIMITS` in
 * `packages/core/src/types/user.ts`: functions run on Deno and only bundle
 * what lives under `supabase/functions`, so they cannot import the app's copy.
 * `Infinity` does not survive JSON either, so unlimited is `null` here.
 *
 * The copy is kept honest by `edgeContract.test.ts` in core, which loads this
 * file and fails the build if the two ever disagree.
 *
 * Only `monthlyUploads` is here, because it is the only limit this side can
 * actually see. The function receives a built model request, not the uploaded
 * documents, so page counts and deck counts stay client-side checks. What
 * bounds spend here is the upload count together with the payload and token
 * ceilings in `chatRequest.ts`.
 */

export type Plan = 'free' | 'pro' | 'lifetime';

export interface ServerPlanLimits {
  /** Generations per calendar month. `null` means unlimited. */
  monthlyUploads: number | null;
}

export const PLAN_LIMITS: Record<Plan, ServerPlanLimits> = {
  free: { monthlyUploads: 5 },
  pro: { monthlyUploads: 50 },
  lifetime: { monthlyUploads: null },
};

export function isPlan(value: unknown): value is Plan {
  return value === 'free' || value === 'pro' || value === 'lifetime';
}

/**
 * The allowance for a plan name read out of the database. An unrecognised
 * value falls back to `free` rather than to unlimited — a row written by some
 * future migration should cost us nothing until this file knows about it.
 */
export function limitsFor(plan: unknown): ServerPlanLimits {
  return isPlan(plan) ? PLAN_LIMITS[plan] : PLAN_LIMITS.free;
}

/** `YYYY-MM` in UTC — the same period key the client and the SQL rows use. */
export function usagePeriod(now: Date = new Date()): string {
  const month = `${now.getUTCMonth() + 1}`.padStart(2, '0');
  return `${now.getUTCFullYear()}-${month}`;
}
