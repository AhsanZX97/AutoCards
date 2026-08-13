import { describe, expect, it } from 'vitest';
import { createMemoryStorage } from '../../lib/storage';
import { createAuthStore } from '../authStore';
import type { AuthService } from '../../services/auth/types';
import type { Session, User } from '../../types';

function makeUser(username: string, isAdmin = false): User {
  return {
    id: 'u1',
    email: `${username}@example.com`,
    username,
    initials: 'XX',
    plan: 'free',
    isAdmin,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

function makeSession(username: string, isAdmin = false): Session {
  return { user: makeUser(username, isAdmin), token: 'token', expiresAt: '2099-01-01T00:00:00.000Z' };
}

function makeAuth(): AuthService {
  return {
    signIn: async () => makeSession('someone'),
    signUp: async () => ({ status: 'authenticated', session: makeSession('someone') }),
    signInWithGoogle: async () => {},
    startGoogleSignIn: async () => 'https://accounts.google.com/o/oauth2/auth',
    restoreFromUrl: async () => null,
    signOut: async () => {},
    restore: async (session) => session,
    updateProfile: async (user, patch) => ({ ...user, ...patch }),
    changePlan: async (user, plan) => ({ ...user, plan }),
    requestPasswordReset: async () => {},
    updatePassword: async () => {},
  };
}

function setup(username: string, isAdmin = false) {
  const store = createAuthStore(makeAuth(), createMemoryStorage());
  store.setState({ session: makeSession(username, isAdmin), status: 'authenticated' });
  return store;
}

describe('createAuthStore.changePlan', () => {
  it('changes the plan for an admin account', async () => {
    const store = setup('ahsandegreat', true);
    await store.getState().changePlan('pro');
    expect(store.getState().session?.user.plan).toBe('pro');
  });

  it('leaves the plan alone for a non-admin account', async () => {
    // Hiding the control is all this does; `admin_set_plan` refuses the write
    // server-side regardless of what the client decides to call.
    const store = setup('someone');
    await store.getState().changePlan('pro');
    expect(store.getState().session?.user.plan).toBe('free');
  });

  it('does nothing when signed out', async () => {
    const store = createAuthStore(makeAuth(), createMemoryStorage());
    await store.getState().changePlan('pro');
    expect(store.getState().session).toBeNull();
  });
});

describe('createAuthStore.restore', () => {
  /**
   * The failure this guards: `restore` rejected unhandled, the status stayed
   * on 'restoring', and every screen behind `RequireAuth` rendered a spinner
   * that never resolved.
   */
  it('resolves to signed-out when the profile cannot be read', async () => {
    const auth: AuthService = {
      ...makeAuth(),
      restore: async () => {
        throw new Error('Could not load your profile.');
      },
    };
    const store = createAuthStore(auth, createMemoryStorage());
    store.setState({ session: makeSession('someone'), status: 'idle' });

    await expect(store.getState().restore()).resolves.toBeUndefined();

    expect(store.getState().status).toBe('signed-out');
    expect(store.getState().session).toBeNull();
  });

  it('restores a session that is still good', async () => {
    const store = createAuthStore(makeAuth(), createMemoryStorage());
    store.setState({ session: makeSession('someone'), status: 'idle' });

    await store.getState().restore();

    expect(store.getState().status).toBe('authenticated');
  });

  it('reports signed-out when there is no stored session at all', async () => {
    const store = createAuthStore(makeAuth(), createMemoryStorage());

    await store.getState().restore();

    expect(store.getState().status).toBe('signed-out');
  });

  it('does not ask the provider on a cold start with nothing stored', async () => {
    let asked = false;
    const auth: AuthService = {
      ...makeAuth(),
      restore: async (session) => {
        asked = true;
        return session;
      },
    };
    const store = createAuthStore(auth, createMemoryStorage());

    await store.getState().restore();

    expect(asked).toBe(false);
  });

  /**
   * The password-recovery case. The link in the email is consumed by the
   * Supabase client on page load, so the session exists in the provider and
   * nowhere else — nothing has been persisted. Short-circuiting on the empty
   * store is what made a valid reset link render as "this link has expired".
   */
  it('adopts a provider session that was never stored locally', async () => {
    const auth: AuthService = {
      ...makeAuth(),
      // Mirrors SupabaseAuthService, which ignores the argument and asks the
      // provider directly.
      restore: async () => makeSession('recovering'),
    };
    const store = createAuthStore(auth, createMemoryStorage());

    await store.getState().restore({ fromProvider: true });

    expect(store.getState().status).toBe('authenticated');
    expect(store.getState().session?.user.username).toBe('recovering');
  });

  it('still reports signed-out when the provider turns out to have nothing', async () => {
    const auth: AuthService = { ...makeAuth(), restore: async () => null };
    const store = createAuthStore(auth, createMemoryStorage());

    await store.getState().restore({ fromProvider: true });

    expect(store.getState().status).toBe('signed-out');
  });
});

describe('createAuthStore.signInWithGoogle', () => {
  it('hands the provider the address the browser should come back to', async () => {
    let asked: string | undefined;
    const auth: AuthService = {
      ...makeAuth(),
      signInWithGoogle: async (redirectTo) => {
        asked = redirectTo;
      },
    };
    const store = createAuthStore(auth, createMemoryStorage());

    await store.getState().signInWithGoogle('https://autocards.study/auth/callback');

    expect(asked).toBe('https://autocards.study/auth/callback');
  });

  /**
   * There is no session to set here — the call ends with the browser leaving
   * for Google, and the session arrives on the way back. Staying on 'loading'
   * is what keeps the button spinning until the page is gone.
   */
  it('stays loading while the browser is on its way to the provider', async () => {
    const store = createAuthStore(makeAuth(), createMemoryStorage());

    await expect(store.getState().signInWithGoogle('https://x.test/auth/callback')).resolves.toBe(
      true,
    );

    expect(store.getState().status).toBe('loading');
  });

  it('reports the failure and stops loading when the provider refuses', async () => {
    const auth: AuthService = {
      ...makeAuth(),
      signInWithGoogle: async () => {
        throw new Error('Provider is not enabled.');
      },
    };
    const store = createAuthStore(auth, createMemoryStorage());

    await expect(store.getState().signInWithGoogle('https://x.test/auth/callback')).resolves.toBe(
      false,
    );

    expect(store.getState().status).toBe('signed-out');
    expect(store.getState().error).toBe('Provider is not enabled.');
  });

  /** A half-finished password sign-up must not leave its notice on screen. */
  it('clears a pending confirmation notice', async () => {
    const store = createAuthStore(makeAuth(), createMemoryStorage());
    store.setState({ pendingConfirmationEmail: 'someone@example.com' });

    await store.getState().signInWithGoogle('https://x.test/auth/callback');

    expect(store.getState().pendingConfirmationEmail).toBeNull();
  });
});

describe('createAuthStore.startGoogleSignIn', () => {
  it('resolves to the authorize URL the service hands back', async () => {
    const store = createAuthStore(makeAuth(), createMemoryStorage());

    await expect(
      store.getState().startGoogleSignIn('https://x.test/auth/callback'),
    ).resolves.toBe('https://accounts.google.com/o/oauth2/auth');

    expect(store.getState().status).toBe('loading');
  });

  it('reports the failure and stops loading when the provider refuses', async () => {
    const auth: AuthService = {
      ...makeAuth(),
      startGoogleSignIn: async () => {
        throw new Error('Provider is not enabled.');
      },
    };
    const store = createAuthStore(auth, createMemoryStorage());

    await expect(
      store.getState().startGoogleSignIn('https://x.test/auth/callback'),
    ).resolves.toBeNull();

    expect(store.getState().status).toBe('signed-out');
    expect(store.getState().error).toBe('Provider is not enabled.');
  });
});

describe('createAuthStore.signOut', () => {
  it('pushes anything unsynced before giving up the session', async () => {
    const order: string[] = [];
    const auth: AuthService = {
      ...makeAuth(),
      signOut: async () => {
        order.push('signOut');
      },
    };
    const store = createAuthStore(auth, createMemoryStorage(), {
      flushBeforeSignOut: async () => {
        order.push('flush');
        return true;
      },
    });
    store.setState({ session: makeSession('someone'), status: 'authenticated' });

    await expect(store.getState().signOut()).resolves.toBe(true);

    // The token is what authorises the push, so the flush has to come first.
    expect(order).toEqual(['flush', 'signOut']);
    expect(store.getState().session).toBeNull();
  });

  /**
   * Signing out wipes local decks. Work that could not be pushed would be
   * gone, so the store refuses and lets the caller ask the user.
   */
  it('refuses to sign out while local changes are still unsynced', async () => {
    const store = createAuthStore(makeAuth(), createMemoryStorage(), {
      flushBeforeSignOut: async () => false,
    });
    store.setState({ session: makeSession('someone'), status: 'authenticated' });

    await expect(store.getState().signOut()).resolves.toBe(false);

    expect(store.getState().session).not.toBeNull();
    expect(store.getState().status).toBe('authenticated');
  });

  it('signs out anyway once the user has chosen to lose them', async () => {
    const store = createAuthStore(makeAuth(), createMemoryStorage(), {
      flushBeforeSignOut: async () => false,
    });
    store.setState({ session: makeSession('someone'), status: 'authenticated' });

    await expect(store.getState().signOut({ force: true })).resolves.toBe(true);

    expect(store.getState().session).toBeNull();
  });

  it('treats a flush that throws as unsynced rather than crashing the sign-out', async () => {
    const store = createAuthStore(makeAuth(), createMemoryStorage(), {
      flushBeforeSignOut: async () => {
        throw new Error('offline');
      },
    });
    store.setState({ session: makeSession('someone'), status: 'authenticated' });

    await expect(store.getState().signOut()).resolves.toBe(false);
    expect(store.getState().session).not.toBeNull();
  });

  it('signs out directly when there is no sync backend to flush', async () => {
    const store = createAuthStore(makeAuth(), createMemoryStorage());
    store.setState({ session: makeSession('someone'), status: 'authenticated' });

    await expect(store.getState().signOut()).resolves.toBe(true);
    expect(store.getState().session).toBeNull();
  });
});
