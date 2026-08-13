import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseAuthService } from '../supabaseAuth';
import { AuthError } from '../types';

const PROFILE = {
  id: 'user-1',
  username: 'ada_lovelace',
  avatar_url: null,
  plan: 'free' as const,
  is_admin: false,
  created_at: '2024-01-01T00:00:00.000Z',
};

const SUPABASE_USER = { id: 'user-1', email: 'ada@example.com' };
const SUPABASE_SESSION = {
  access_token: 'token-abc',
  expires_at: 1_700_000_000,
  user: SUPABASE_USER,
};

/** Chainable stub mimicking the slice of the query builder this service calls. */
function queryResult(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    update: () => builder,
    single: () => Promise.resolve(result),
    then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return builder;
}

interface FakeClientOptions {
  signInWithPassword?: () => Promise<unknown>;
  signUp?: () => Promise<unknown>;
  signOut?: () => Promise<unknown>;
  getSession?: () => Promise<unknown>;
  signInWithOAuth?: () => Promise<unknown>;
  setSession?: () => Promise<unknown>;
  exchangeCodeForSession?: () => Promise<unknown>;
  profile?: { data: unknown; error: unknown };
  rpc?: (name: string, args: unknown) => Promise<unknown>;
}

function fakeClient(options: FakeClientOptions = {}): SupabaseClient {
  return {
    auth: {
      signInWithPassword: options.signInWithPassword ?? (async () => ({ data: {}, error: null })),
      signUp: options.signUp ?? (async () => ({ data: {}, error: null })),
      signOut: options.signOut ?? (async () => ({ error: null })),
      getSession: options.getSession ?? (async () => ({ data: { session: null }, error: null })),
      signInWithOAuth: options.signInWithOAuth ?? (async () => ({ data: { url: null }, error: null })),
      setSession: options.setSession ?? (async () => ({ data: { session: null }, error: null })),
      exchangeCodeForSession:
        options.exchangeCodeForSession ?? (async () => ({ data: { session: null }, error: null })),
    },
    from: () => queryResult(options.profile ?? { data: PROFILE, error: null }),
    rpc: options.rpc ?? (async () => ({ data: null, error: null })),
  } as unknown as SupabaseClient;
}

describe('SupabaseAuthService.signIn', () => {
  it('maps a successful sign-in to a Session', async () => {
    const service = new SupabaseAuthService(
      fakeClient({
        signInWithPassword: async () => ({ data: { session: SUPABASE_SESSION, user: SUPABASE_USER }, error: null }),
      }),
    );
    const session = await service.signIn({ email: 'ada@example.com', password: 'hunter22' });
    expect(session.user).toEqual({
      id: 'user-1',
      email: 'ada@example.com',
      username: 'ada_lovelace',
      initials: 'AD',
      avatarUrl: undefined,
      plan: 'free',
      isAdmin: false,
      createdAt: '2024-01-01T00:00:00.000Z',
    });
    expect(session.token).toBe('token-abc');
  });

  it('throws an AuthError when Supabase rejects the credentials', async () => {
    const service = new SupabaseAuthService(
      fakeClient({
        signInWithPassword: async () => ({ data: { session: null, user: null }, error: { message: 'Invalid login credentials' } }),
      }),
    );
    await expect(service.signIn({ email: 'ada@example.com', password: 'wrong' })).rejects.toThrow(AuthError);
  });
});

describe('SupabaseAuthService.signUp', () => {
  it('returns an authenticated result when Supabase returns a session immediately', async () => {
    const service = new SupabaseAuthService(
      fakeClient({
        signUp: async () => ({ data: { session: SUPABASE_SESSION, user: SUPABASE_USER }, error: null }),
      }),
    );
    const result = await service.signUp({ email: 'ada@example.com', password: 'hunter22', username: 'ada_lovelace' });
    expect(result.status).toBe('authenticated');
    if (result.status === 'authenticated') {
      expect(result.session.user.email).toBe('ada@example.com');
      expect(result.session.user.username).toBe('ada_lovelace');
    }
  });

  it('returns a confirmation-required result when Supabase withholds the session', async () => {
    const service = new SupabaseAuthService(
      fakeClient({
        signUp: async () => ({ data: { session: null, user: { id: 'user-1' } }, error: null }),
      }),
    );
    const result = await service.signUp({ email: 'Ada@Example.com', password: 'hunter22', username: 'ada' });
    expect(result).toEqual({ status: 'confirmation-required', email: 'ada@example.com' });
  });

  it('rejects an invalid username before calling Supabase', async () => {
    const signUp = vi.fn(async () => ({ data: {}, error: null }));
    const service = new SupabaseAuthService(fakeClient({ signUp }));
    await expect(
      service.signUp({ email: 'ada@example.com', password: 'hunter22', username: 'Ada Lovelace!' }),
    ).rejects.toMatchObject({ field: 'name' });
    expect(signUp).not.toHaveBeenCalled();
  });

  /** Where a confirmation email's link lands — mobile has to say, since core doesn't know its own scheme. */
  it('forwards redirectTo as the confirmation email’s landing page', async () => {
    const signUp = vi.fn(async () => ({ data: { session: null, user: { id: 'user-1' } }, error: null }));
    const service = new SupabaseAuthService(fakeClient({ signUp }));

    await service.signUp(
      { email: 'ada@example.com', password: 'hunter22', username: 'ada_lovelace' },
      'autocards://callback',
    );

    expect(signUp).toHaveBeenCalledWith(
      expect.objectContaining({ options: expect.objectContaining({ emailRedirectTo: 'autocards://callback' }) }),
    );
  });
});

describe('SupabaseAuthService.restore', () => {
  it('returns null when Supabase has no current session', async () => {
    const service = new SupabaseAuthService(fakeClient());
    await expect(service.restore()).resolves.toBeNull();
  });

  it("trusts the Supabase client's live session over any locally-cached copy", async () => {
    const service = new SupabaseAuthService(
      fakeClient({ getSession: async () => ({ data: { session: SUPABASE_SESSION }, error: null }) }),
    );
    const session = await service.restore();
    expect(session?.user.id).toBe('user-1');
  });
});

describe('SupabaseAuthService.startGoogleSignIn', () => {
  it('asks for the authorize URL without letting the client navigate', async () => {
    const calls: unknown[] = [];
    const service = new SupabaseAuthService(
      fakeClient({
        signInWithOAuth: async (...args: unknown[]) => {
          calls.push(args);
          return { data: { url: 'https://accounts.google.com/o/oauth2/auth?client_id=1' }, error: null };
        },
      }),
    );

    const url = await service.startGoogleSignIn('autocards://callback');

    expect(url).toBe('https://accounts.google.com/o/oauth2/auth?client_id=1');
    expect(calls).toEqual([
      [{ provider: 'google', options: { redirectTo: 'autocards://callback', skipBrowserRedirect: true } }],
    ]);
  });

  it('throws when the provider refuses the hand-off', async () => {
    const service = new SupabaseAuthService(
      fakeClient({
        signInWithOAuth: async () => ({ data: { url: null }, error: { message: 'Provider is not enabled.' } }),
      }),
    );

    await expect(service.startGoogleSignIn('autocards://callback')).rejects.toThrow(AuthError);
  });
});

describe('SupabaseAuthService.restoreFromUrl', () => {
  it('resolves to null for a URL carrying nothing usable', async () => {
    const service = new SupabaseAuthService(fakeClient());
    await expect(service.restoreFromUrl('autocards://reset-password')).resolves.toBeNull();
  });

  it('throws the provider’s own denial rather than treating it as empty', async () => {
    const service = new SupabaseAuthService(fakeClient());
    await expect(
      service.restoreFromUrl('autocards://callback?error=access_denied&error_description=Denied'),
    ).rejects.toThrow(AuthError);
  });

  it('exchanges a token pair in the fragment for a session', async () => {
    const service = new SupabaseAuthService(
      fakeClient({
        setSession: async () => ({ data: { session: SUPABASE_SESSION }, error: null }),
      }),
    );

    const session = await service.restoreFromUrl(
      'autocards://reset-password#access_token=a1&refresh_token=r1&type=recovery',
    );

    expect(session?.user.id).toBe('user-1');
  });

  it('exchanges a PKCE code in the query string for a session', async () => {
    const service = new SupabaseAuthService(
      fakeClient({
        exchangeCodeForSession: async () => ({ data: { session: SUPABASE_SESSION }, error: null }),
      }),
    );

    const session = await service.restoreFromUrl('https://autocards.study/auth/callback?code=abc123');

    expect(session?.user.id).toBe('user-1');
  });

  it('resolves to null when the exchange itself fails', async () => {
    const service = new SupabaseAuthService(
      fakeClient({
        setSession: async () => ({ data: { session: null }, error: { message: 'invalid token' } }),
      }),
    );

    await expect(
      service.restoreFromUrl('autocards://reset-password#access_token=a1&refresh_token=r1'),
    ).resolves.toBeNull();
  });
});

describe('SupabaseAuthService.changePlan', () => {
  const USER = {
    id: 'user-1',
    email: 'ada@example.com',
    username: 'ada_lovelace',
    initials: 'AD',
    plan: 'free' as const,
    isAdmin: true,
    createdAt: '2024-01-01T00:00:00.000Z',
  };

  /**
   * The column is not writable from the client any more — that was how anyone
   * could hand themselves an unlimited allowance — so this has to go through
   * the function that checks who is asking.
   */
  it('asks the server to set the plan rather than writing the column', async () => {
    const calls: Array<{ name: string; args: unknown }> = [];
    const service = new SupabaseAuthService(
      fakeClient({
        rpc: async (name, args) => {
          calls.push({ name, args });
          return { data: null, error: null };
        },
      }),
    );

    const updated = await service.changePlan(USER, 'pro');

    expect(calls).toEqual([{ name: 'admin_set_plan', args: { p_user: 'user-1', p_plan: 'pro' } }]);
    expect(updated.plan).toBe('pro');
  });

  it('surfaces a refusal from the server rather than pretending it worked', async () => {
    const service = new SupabaseAuthService(
      fakeClient({
        rpc: async () => ({ data: null, error: { message: 'Only an administrator can change a plan' } }),
      }),
    );

    await expect(service.changePlan(USER, 'pro')).rejects.toBeInstanceOf(AuthError);
  });
});
