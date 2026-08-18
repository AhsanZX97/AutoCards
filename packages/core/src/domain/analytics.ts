import type { AnalyticsFunnel, AnalyticsReminders } from '../types';

/**
 * Reading an analytics report: the few rules that decide what a number *means*
 * rather than how it is drawn. Chart geometry stays in the app that renders it;
 * everything here is the part that would be wrong in the same way twice if each
 * screen worked it out for itself.
 */

export type DeltaDirection = 'up' | 'down' | 'flat';

export interface AnalyticsDelta {
  /** Plain difference, current minus previous. */
  absolute: number;
  /**
   * The difference as a percentage of the previous window — null when there is
   * no baseline to divide by. Two signups against a week of none is not
   * "+200%", it is the first two, and a tile that claims otherwise is noise.
   */
  percent: number | null;
  direction: DeltaDirection;
}

/**
 * One window against the one before it.
 *
 * The comparison is always against an equally-long preceding window rather
 * than against yesterday, because today is still running: every "current"
 * figure is partial until the day ends, and the only fair thing to hold it
 * against is a period of the same shape.
 */
export function analyticsDelta(
  current: number | null | undefined,
  previous: number | null | undefined,
): AnalyticsDelta {
  const now = current ?? 0;
  const before = previous ?? 0;
  const absolute = now - before;
  const direction: DeltaDirection = absolute === 0 ? 'flat' : absolute > 0 ? 'up' : 'down';
  const percent = before === 0 ? null : Math.round((absolute / before) * 1000) / 10;
  return { absolute, percent, direction };
}

/**
 * A count at a glance: `942`, `1,284`, `12.9K`, `4.2M`.
 *
 * Grouped with a comma up to five figures, where the exact number still reads,
 * and compacted past that, where it stops being something anyone reads digit by
 * digit. Null is a dash rather than a zero — "we have no number" and "the
 * number is nought" are different facts and a dashboard must not merge them.
 */
export function compactCount(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const abs = Math.abs(value);
  if (abs < 10_000) return value.toLocaleString('en-US');
  const [divisor, suffix] = abs < 1_000_000 ? [1_000, 'K'] : [1_000_000, 'M'];
  const scaled = value / divisor;
  // `20.0K` says nothing `20K` doesn't; a real decimal is kept.
  const text = Math.abs(scaled) >= 100 ? scaled.toFixed(0) : scaled.toFixed(1).replace(/\.0$/, '');
  return `${text}${suffix}`;
}

export type FunnelStageKey = keyof AnalyticsFunnel;

export interface FunnelStage {
  key: FunnelStageKey;
  value: number;
  /** Percentage of the people who signed up, or null when nobody did. */
  share: number | null;
  /** How many were lost between the previous stage and this one. */
  dropped: number;
}

/**
 * The signup funnel as ordered stages, each measured against the top.
 *
 * Every stage divides by `signedUp` rather than by the stage before it, so the
 * numbers add up to a story about one cohort instead of a chain of ratios that
 * each look fine. `dropped` carries the step-to-step loss separately — the gap
 * between building a deck and studying it is the one worth chasing, because
 * somebody who generated cards and never used them got nothing out of the
 * product and it cost a generation to find out.
 */
export function funnelStages(funnel: AnalyticsFunnel): FunnelStage[] {
  const order: FunnelStageKey[] = ['signedUp', 'builtADeck', 'studiedOnce', 'studied3Plus'];
  const top = funnel.signedUp;
  return order.map((key, index) => {
    const value = funnel[key];
    const previous = index === 0 ? value : funnel[order[index - 1]!];
    return {
      key,
      value,
      share: top === 0 ? null : Math.round((value / top) * 1000) / 10,
      dropped: Math.max(0, previous - value),
    };
  });
}

export type HealthStatus = 'good' | 'warning' | 'critical';

/**
 * Whether the reminder sweep is keeping up.
 *
 * `send-reminders` runs on a cron and fails quietly when it fails at all, so
 * the backlog is the only symptom there is. A few overdue rows is a sweep that
 * ran late; a pile of them is a cron that has stopped, and the difference is
 * worth seeing without doing the arithmetic. Rows with no `next_send_at`
 * count too — a schedule nothing will ever pick up is as dead as an overdue one.
 */
export function remindersHealth(reminders: AnalyticsReminders): HealthStatus {
  const stuck = reminders.overdue + reminders.notScheduled;
  if (stuck === 0) return 'good';
  return stuck >= 10 ? 'critical' : 'warning';
}
