import { useEffect } from 'react';
import {
  PLAN_LIMITS,
  remainingUploads,
  usageForPeriod,
  usagePeriod,
  type App,
  type UploadQuotaSnapshot,
} from '@autocards/core';
import { useApp } from './appContext';

/**
 * Accounts already read from the server this page load, as `userId:period`.
 *
 * The hook runs in every component that shows the meter, and they can be
 * mounted at once — without this, opening the deck library would fire the same
 * query three times. One read per account per month is enough, because every
 * generation after it reports the new count in its own reply.
 */
const hydrated = new Set<string>();

/**
 * Corrects the local count from the server's.
 *
 * The local count is a display convenience kept in storage the user can clear,
 * so on a fresh device — or one whose storage was wiped — it starts at zero
 * while the server may know about four. Without this the meter is only right
 * after the first generation of the session, and someone can be refused with
 * "4 of 5 left" still on screen.
 */
function useServerCount(app: App, userId: string | undefined): void {
  useEffect(() => {
    const account = app.services.account;
    if (!userId || !account) return;

    const period = usagePeriod();
    const key = `${userId}:${period}`;
    if (hydrated.has(key)) return;
    hydrated.add(key);

    void account
      .fetchUploadUsage(userId, period)
      .then((usage) => app.usageStore.getState().adoptServerCount(userId, usage))
      // Keep whatever the meter already showed; the server still enforces the
      // real limit, so being briefly optimistic here costs nothing.
      .catch(() => hydrated.delete(key));
  }, [app, userId]);
}

export interface UploadQuota {
  /** Documents converted this month. */
  used: number;
  /** The plan's monthly allowance. `Infinity` when unlimited. */
  limit: number;
  /** Allowance left. `Infinity` when unlimited. */
  remaining: number;
  /** False once the allowance is spent, or when nobody is signed in. */
  canUpload: boolean;
  /**
   * Records what a finished generation cost. Call it after one succeeds, not
   * before.
   *
   * Pass the `quota` a generation came back with and the meter takes the
   * server's count, which is the one that actually decides. Without it — a run
   * on someone's own key, which never reached our server — it falls back to
   * counting one here.
   */
  record: (reported?: UploadQuotaSnapshot) => void;
}

/**
 * The signed-in account's monthly upload allowance, shared by both paths that
 * spend it: creating a deck from a document, and adding cards to an existing
 * deck from another one.
 */
export function useUploadQuota(): UploadQuota {
  const app = useApp();
  const user = app.authStore((s) => s.session?.user);
  const stored = app.usageStore((s) => (user ? s.uploadsByUser[user.id] : undefined));

  useServerCount(app, user?.id);

  const plan = user?.plan ?? 'free';
  const limit = PLAN_LIMITS[plan].monthlyUploads;
  const used = usageForPeriod(stored).uploads;
  const remaining = remainingUploads(plan, stored);

  return {
    used,
    limit,
    remaining,
    canUpload: Boolean(user) && remaining > 0,
    record: (reported) => {
      if (!user) return;
      const usage = app.usageStore.getState();
      if (reported) usage.adoptServerCount(user.id, reported);
      else usage.recordUpload(user.id);
    },
  };
}

/** "3 of 5" / "12 of unlimited", for the meter shown next to an upload box. */
export function formatQuota(quota: UploadQuota): string {
  if (quota.limit === Number.POSITIVE_INFINITY) return `${quota.used} used this month`;
  return `${quota.remaining} of ${quota.limit} uploads left this month`;
}
