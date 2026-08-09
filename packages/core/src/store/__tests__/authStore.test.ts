import { describe, expect, it } from 'vitest';
import { createMemoryStorage } from '../../lib/storage';
import { createAuthStore } from '../authStore';
import type { AuthService } from '../../services/auth/types';
import type { Session, User } from '../../types';

function makeUser(username: string): User {
  return {
    id: 'u1',
    email: `${username}@example.com`,
    username,
    initials: 'XX',
    plan: 'free',
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

function makeSession(username: string): Session {
  return { user: makeUser(username), token: 'token', expiresAt: '2099-01-01T00:00:00.000Z' };
}

function makeAuth(): AuthService {
  return {
    signIn: async () => makeSession('someone'),
    signUp: async () => ({ status: 'authenticated', session: makeSession('someone') }),
    signOut: async () => {},
    restore: async (session) => session,
    updateProfile: async (user, patch) => ({ ...user, ...patch }),
    changePlan: async (user, plan) => ({ ...user, plan }),
  };
}

function setup(username: string) {
  const store = createAuthStore(makeAuth(), createMemoryStorage());
  store.setState({ session: makeSession(username), status: 'authenticated' });
  return store;
}

describe('createAuthStore.changePlan', () => {
  it('changes the plan for an admin account', async () => {
    const store = setup('ahsandegreat');
    await store.getState().changePlan('pro');
    expect(store.getState().session?.user.plan).toBe('pro');
  });

  it('leaves the plan alone for a non-admin account', async () => {
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
