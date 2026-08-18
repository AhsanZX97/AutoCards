import { useCallback, useEffect, useRef, useState } from 'react';
import { AnalyticsError, type AnalyticsFailure, type AnalyticsReport } from '@autocards/core';
import { useApp } from '../../lib/appContext';

export const WINDOW_PRESETS = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
] as const;

interface AnalyticsState {
  report: AnalyticsReport | null;
  loading: boolean;
  /** True while a new window is loading over a report already on screen. */
  refreshing: boolean;
  error: string | null;
  reason: AnalyticsFailure | null;
  reload: () => void;
}

/** The zone the browser is in, so days are cut where the reader lives. */
function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/**
 * Fetches the report for a window.
 *
 * Changing the window keeps the last report on screen while the next one loads
 * — the charts hold their frame at reduced opacity rather than collapsing into
 * skeletons, so nothing jumps and the numbers never flash through zero.
 */
export function useAnalytics(days: number): AnalyticsState {
  const app = useApp();
  const analytics = app.services.analytics;
  const [report, setReport] = useState<AnalyticsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState<AnalyticsFailure | null>(null);
  const [nonce, setNonce] = useState(0);
  // A slow read for a window nobody is looking at any more must not land.
  const request = useRef(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!analytics) {
      setLoading(false);
      setError('This build has no Supabase project configured.');
      setReason('unavailable');
      return undefined;
    }

    const ticket = ++request.current;
    setLoading(true);
    let cancelled = false;

    void analytics
      .fetch({ days, timeZone: deviceTimeZone() })
      .then((next) => {
        if (cancelled || ticket !== request.current) return;
        setReport(next);
        setError(null);
        setReason(null);
      })
      .catch((failure: unknown) => {
        if (cancelled || ticket !== request.current) return;
        const isKnown = failure instanceof AnalyticsError;
        setError(isKnown ? failure.message : 'The analytics could not be read.');
        setReason(isKnown ? failure.reason : 'unavailable');
        if (isKnown && failure.reason === 'forbidden') setReport(null);
      })
      .finally(() => {
        if (!cancelled && ticket === request.current) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [analytics, days, nonce]);

  return { report, loading, refreshing: loading && report !== null, error, reason, reload };
}
