import { useEffect } from 'react';
import {
  PLAN_LIMITS,
  formatQuota as formatQuotaMessage,
  remainingUploads,
  usageForPeriod,
  usagePeriod,
  type App,
  type UploadQuotaSnapshot,
} from '@autocards/core';
import { useApp } from './appContext';

/**
 * Mirrors the web app's `useUploadQuota` (`apps/web/src/lib/useUploadQuota.ts`)
 * so both clients read the same allowance the same way. See that file for why
 * the server count needs adopting on mount.
 */
const hydrated = new Set<string>();

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
      .catch(() => hydrated.delete(key));
  }, [app, userId]);
}

export interface UploadQuota {
  used: number;
  limit: number;
  remaining: number;
  canUpload: boolean;
  record: (reported?: UploadQuotaSnapshot) => void;
}

/** The signed-in account's monthly upload allowance. */
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

/** "3 of 5 uploads left this month" / "12 used this month". */
export function formatQuota(quota: UploadQuota): string {
  return formatQuotaMessage(quota.remaining, quota.limit, quota.used);
}
