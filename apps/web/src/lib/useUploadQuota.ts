import { PLAN_LIMITS, remainingUploads, usageForPeriod } from '@autocards/core';
import { useApp } from './appContext';

export interface UploadQuota {
  /** PDFs converted this month. */
  used: number;
  /** The plan's monthly allowance. `Infinity` when unlimited. */
  limit: number;
  /** Allowance left. `Infinity` when unlimited. */
  remaining: number;
  /** False once the allowance is spent, or when nobody is signed in. */
  canUpload: boolean;
  /** Spends one upload. Call it after a generation succeeds, not before. */
  record: () => void;
}

/**
 * The signed-in account's monthly PDF allowance, shared by both paths that
 * spend it: creating a deck from a document, and adding cards to an existing
 * deck from another one.
 */
export function useUploadQuota(): UploadQuota {
  const app = useApp();
  const user = app.authStore((s) => s.session?.user);
  const stored = app.usageStore((s) => (user ? s.uploadsByUser[user.id] : undefined));

  const plan = user?.plan ?? 'free';
  const limit = PLAN_LIMITS[plan].monthlyUploads;
  const used = usageForPeriod(stored).uploads;
  const remaining = remainingUploads(plan, stored);

  return {
    used,
    limit,
    remaining,
    canUpload: Boolean(user) && remaining > 0,
    record: () => {
      if (user) app.usageStore.getState().recordUpload(user.id);
    },
  };
}

/** "3 of 5" / "12 of unlimited", for the meter shown next to an upload box. */
export function formatQuota(quota: UploadQuota): string {
  if (quota.limit === Number.POSITIVE_INFINITY) return `${quota.used} used this month`;
  return `${quota.remaining} of ${quota.limit} uploads left this month`;
}
