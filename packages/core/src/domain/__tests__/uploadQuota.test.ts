import { describe, expect, it } from 'vitest';
import {
  canUpload,
  countUpload,
  remainingUploads,
  usageForPeriod,
  usagePeriod,
} from '../uploadQuota';

const JAN = new Date('2026-01-15T09:00:00.000Z');
const FEB = new Date('2026-02-01T00:00:00.000Z');

describe('usagePeriod', () => {
  it('names the month in UTC', () => {
    expect(usagePeriod(JAN)).toBe('2026-01');
  });

  it('zero-pads single-digit months', () => {
    expect(usagePeriod(new Date('2026-09-30T23:59:59.000Z'))).toBe('2026-09');
  });
});

describe('usageForPeriod', () => {
  it('starts at zero when nothing has been recorded', () => {
    expect(usageForPeriod(undefined, JAN)).toEqual({ period: '2026-01', uploads: 0 });
  });

  it('keeps a count recorded in the same month', () => {
    expect(usageForPeriod({ period: '2026-01', uploads: 3 }, JAN)).toEqual({ period: '2026-01', uploads: 3 });
  });

  it('resets a count left over from an earlier month', () => {
    expect(usageForPeriod({ period: '2026-01', uploads: 5 }, FEB)).toEqual({ period: '2026-02', uploads: 0 });
  });
});

describe('countUpload', () => {
  it('adds one to the current month', () => {
    expect(countUpload({ period: '2026-01', uploads: 2 }, JAN)).toEqual({ period: '2026-01', uploads: 3 });
  });

  it('starts a fresh month at one', () => {
    expect(countUpload({ period: '2026-01', uploads: 5 }, FEB)).toEqual({ period: '2026-02', uploads: 1 });
  });
});

describe('remainingUploads', () => {
  it('counts down from the plan allowance', () => {
    expect(remainingUploads('free', { period: '2026-01', uploads: 2 }, JAN)).toBe(3);
  });

  it('never goes below zero', () => {
    expect(remainingUploads('free', { period: '2026-01', uploads: 99 }, JAN)).toBe(0);
  });

  it('reports the full allowance once the month rolls over', () => {
    expect(remainingUploads('free', { period: '2026-01', uploads: 5 }, FEB)).toBe(5);
  });

  it('stays infinite on an unlimited plan', () => {
    expect(remainingUploads('lifetime', { period: '2026-01', uploads: 400 }, JAN)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('canUpload', () => {
  it('allows an upload with allowance left', () => {
    expect(canUpload('free', { period: '2026-01', uploads: 4 }, JAN)).toBe(true);
  });

  it('blocks an upload once the allowance is spent', () => {
    expect(canUpload('free', { period: '2026-01', uploads: 5 }, JAN)).toBe(false);
  });

  it('allows an upload when there is no usage at all', () => {
    expect(canUpload('free', undefined, JAN)).toBe(true);
  });
});
