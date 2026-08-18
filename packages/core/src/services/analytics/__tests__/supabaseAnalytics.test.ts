import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseAnalyticsBackend } from '../supabaseAnalytics';
import { AnalyticsError } from '../types';

/** The one call this backend makes, stubbed at the client boundary. */
function fakeClient(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(result);
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

const report = {
  generatedAt: '2026-08-18T10:00:00.000Z',
  days: 7,
  timeZone: 'Europe/London',
  from: '2026-08-12',
  to: '2026-08-18',
  current: { signups: 3 },
  daily: [{ date: '2026-08-12', signups: 1 }],
};

describe('SupabaseAnalyticsBackend.fetch', () => {
  it('asks the server for the window it was given', async () => {
    const { client, rpc } = fakeClient({ data: report, error: null });
    await new SupabaseAnalyticsBackend(client).fetch({ days: 30, timeZone: 'Europe/London' });

    expect(rpc).toHaveBeenCalledWith('admin_analytics', { p_days: 30, p_tz: 'Europe/London' });
  });

  it('defaults to a week of UTC days when nothing is asked for', async () => {
    const { client, rpc } = fakeClient({ data: report, error: null });
    await new SupabaseAnalyticsBackend(client).fetch();

    expect(rpc).toHaveBeenCalledWith('admin_analytics', { p_days: 7, p_tz: 'UTC' });
  });

  it('returns the payload as the server built it', async () => {
    const { client } = fakeClient({ data: report, error: null });
    await expect(new SupabaseAnalyticsBackend(client).fetch()).resolves.toEqual(report);
  });

  it('reports a refused read as forbidden rather than as a broken server', async () => {
    const { client } = fakeClient({
      data: null,
      error: { message: 'Only an administrator can read the analytics' },
    });

    await expect(new SupabaseAnalyticsBackend(client).fetch()).rejects.toMatchObject({
      reason: 'forbidden',
    });
  });

  it('reports a missing function as unavailable, so the page can say so', async () => {
    const { client } = fakeClient({
      data: null,
      error: { message: 'function public.admin_analytics(integer, text) does not exist' },
    });

    const failure = await new SupabaseAnalyticsBackend(client).fetch().catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(AnalyticsError);
    expect((failure as AnalyticsError).reason).toBe('unavailable');
  });

  it('treats an empty reply as a failure rather than as an empty dashboard', async () => {
    const { client } = fakeClient({ data: null, error: null });
    await expect(new SupabaseAnalyticsBackend(client).fetch()).rejects.toMatchObject({
      reason: 'unavailable',
    });
  });

  it('never asks for a window the function would clamp anyway', async () => {
    const { client, rpc } = fakeClient({ data: report, error: null });
    await new SupabaseAnalyticsBackend(client).fetch({ days: 9999 });

    expect(rpc).toHaveBeenCalledWith('admin_analytics', { p_days: 365, p_tz: 'UTC' });
  });
});
