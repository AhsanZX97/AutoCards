import { describe, expect, it } from 'vitest';
import {
  analyticsDelta,
  compactCount,
  funnelStages,
  remindersHealth,
} from '../analytics';
import type { AnalyticsFunnel, AnalyticsReminders } from '../../types';

function funnel(overrides: Partial<AnalyticsFunnel> = {}): AnalyticsFunnel {
  return { signedUp: 100, builtADeck: 60, studiedOnce: 40, studied3Plus: 10, ...overrides };
}

function reminders(overrides: Partial<AnalyticsReminders> = {}): AnalyticsReminders {
  return {
    firedThisWindow: 10,
    byEmail: 6,
    pushOnly: 4,
    createdThisWindow: 2,
    notScheduled: 0,
    overdue: 0,
    scheduled: 12,
    ...overrides,
  };
}

describe('analyticsDelta', () => {
  it('reports the rise from one window to the next as a percentage', () => {
    expect(analyticsDelta(120, 100)).toEqual({ absolute: 20, percent: 20, direction: 'up' });
  });

  it('reports a fall as a negative percentage', () => {
    expect(analyticsDelta(75, 100)).toEqual({ absolute: -25, percent: -25, direction: 'down' });
  });

  it('calls an unchanged number flat rather than up', () => {
    expect(analyticsDelta(100, 100)).toEqual({ absolute: 0, percent: 0, direction: 'flat' });
  });

  it('has no percentage to report when the previous window was empty', () => {
    expect(analyticsDelta(9, 0)).toEqual({ absolute: 9, percent: null, direction: 'up' });
  });

  it('treats both windows being empty as flat, not as a rise', () => {
    expect(analyticsDelta(0, 0)).toEqual({ absolute: 0, percent: null, direction: 'flat' });
  });

  it('rounds the percentage to one decimal', () => {
    expect(analyticsDelta(2, 3).percent).toBe(-33.3);
  });

  it('reads a missing number as nothing rather than throwing', () => {
    expect(analyticsDelta(null, 10)).toEqual({ absolute: -10, percent: -100, direction: 'down' });
  });
});

describe('compactCount', () => {
  it('leaves counts under a thousand alone', () => {
    expect(compactCount(0)).toBe('0');
    expect(compactCount(942)).toBe('942');
  });

  it('groups thousands with a comma up to ten thousand', () => {
    expect(compactCount(1284)).toBe('1,284');
  });

  it('compacts anything larger', () => {
    expect(compactCount(12_900)).toBe('12.9K');
    expect(compactCount(4_200_000)).toBe('4.2M');
  });

  it('drops a trailing zero decimal', () => {
    expect(compactCount(20_000)).toBe('20K');
  });

  it('shows a dash when there is no number at all', () => {
    expect(compactCount(null)).toBe('—');
  });
});

describe('funnelStages', () => {
  it('measures every stage against the number who signed up', () => {
    expect(funnelStages(funnel()).map((s) => s.share)).toEqual([100, 60, 40, 10]);
  });

  it('reports what each stage lost against the one before it', () => {
    expect(funnelStages(funnel()).map((s) => s.dropped)).toEqual([0, 40, 20, 30]);
  });

  it('keeps the stages in the order somebody moves through them', () => {
    expect(funnelStages(funnel()).map((s) => s.key)).toEqual([
      'signedUp',
      'builtADeck',
      'studiedOnce',
      'studied3Plus',
    ]);
  });

  it('has no share to report when nobody signed up', () => {
    const stages = funnelStages(funnel({ signedUp: 0, builtADeck: 0, studiedOnce: 0, studied3Plus: 0 }));
    expect(stages.every((s) => s.share === null)).toBe(true);
  });
});

describe('remindersHealth', () => {
  it('is healthy when everything due has been sent', () => {
    expect(remindersHealth(reminders())).toBe('good');
  });

  it('warns on a handful of overdue sends — a sweep that ran late', () => {
    expect(remindersHealth(reminders({ overdue: 3 }))).toBe('warning');
  });

  it('is critical once the backlog says the cron has stopped', () => {
    expect(remindersHealth(reminders({ overdue: 25 }))).toBe('critical');
  });

  it('counts reminders with no next send as a backlog of their own', () => {
    expect(remindersHealth(reminders({ notScheduled: 4 }))).toBe('warning');
  });
});
