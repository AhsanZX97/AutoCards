import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseAccountBackend } from '../supabaseAccount';

/** Chainable stub mimicking the slice of the query builder this backend calls. */
function queryResult(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: () => Promise.resolve(result),
  };
  return builder;
}

function fakeClient(byTable: Record<string, { data: unknown; error: unknown }>): SupabaseClient {
  return {
    from: (table: string) => queryResult(byTable[table] ?? { data: null, error: null }),
  } as unknown as SupabaseClient;
}

describe('SupabaseAccountBackend.fetchSubscription', () => {
  it('reads the row the webhook wrote', async () => {
    const backend = new SupabaseAccountBackend(
      fakeClient({
        subscriptions: {
          data: {
            plan: 'pro',
            provider: 'google_play',
            status: 'active',
            current_period_end: '2026-09-09T00:00:00.000Z',
            cancel_at_period_end: false,
          },
          error: null,
        },
      }),
    );

    await expect(backend.fetchSubscription('user-1')).resolves.toEqual({
      plan: 'pro',
      provider: 'google_play',
      status: 'active',
      currentPeriodEnd: '2026-09-09T00:00:00.000Z',
      cancelAtPeriodEnd: false,
    });
  });

  it('reads a row with no provider column yet as stripe', async () => {
    const backend = new SupabaseAccountBackend(
      fakeClient({
        subscriptions: {
          data: { plan: 'pro', provider: null, status: 'active', current_period_end: null, cancel_at_period_end: false },
          error: null,
        },
      }),
    );
    expect((await backend.fetchSubscription('user-1'))?.provider).toBe('stripe');
  });

  it('reports a cancellation that has not taken effect yet', async () => {
    const backend = new SupabaseAccountBackend(
      fakeClient({
        subscriptions: {
          data: { plan: 'pro', status: 'active', current_period_end: null, cancel_at_period_end: true },
          error: null,
        },
      }),
    );

    const subscription = await backend.fetchSubscription('user-1');
    expect(subscription?.cancelAtPeriodEnd).toBe(true);
    expect(subscription?.currentPeriodEnd).toBeUndefined();
  });

  it('returns nothing for an account that never subscribed', async () => {
    const backend = new SupabaseAccountBackend(fakeClient({ subscriptions: { data: null, error: null } }));
    await expect(backend.fetchSubscription('user-1')).resolves.toBeNull();
  });

  it('fails soft rather than breaking the page it is on', async () => {
    const backend = new SupabaseAccountBackend(
      fakeClient({ subscriptions: { data: null, error: { message: 'network' } } }),
    );
    await expect(backend.fetchSubscription('user-1')).resolves.toBeNull();
  });

  it('reads a plan it does not recognise as free', async () => {
    const backend = new SupabaseAccountBackend(
      fakeClient({
        subscriptions: {
          data: { plan: 'enterprise', status: 'active', current_period_end: null, cancel_at_period_end: false },
          error: null,
        },
      }),
    );
    expect((await backend.fetchSubscription('user-1'))?.plan).toBe('free');
  });
});

describe('SupabaseAccountBackend.fetchUploadUsage', () => {
  it('reads the count the server is enforcing', async () => {
    const backend = new SupabaseAccountBackend(
      fakeClient({ usage_counters: { data: { uploads: 4 }, error: null } }),
    );

    await expect(backend.fetchUploadUsage('user-1', '2026-08')).resolves.toEqual({
      period: '2026-08',
      uploads: 4,
    });
  });

  it('reads a month with no row yet as nothing spent', async () => {
    const backend = new SupabaseAccountBackend(fakeClient({ usage_counters: { data: null, error: null } }));

    await expect(backend.fetchUploadUsage('user-1', '2026-08')).resolves.toEqual({
      period: '2026-08',
      uploads: 0,
    });
  });

  it('does not invent a count when the read fails', async () => {
    const backend = new SupabaseAccountBackend(
      fakeClient({ usage_counters: { data: null, error: { message: 'offline' } } }),
    );

    await expect(backend.fetchUploadUsage('user-1', '2026-08')).resolves.toEqual({
      period: '2026-08',
      uploads: 0,
    });
  });
});
