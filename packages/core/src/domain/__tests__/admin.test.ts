import { describe, expect, it } from 'vitest';
import { isAdmin } from '../admin';
import type { User } from '../../types';

function user(patch: Partial<User> = {}): User {
  return {
    id: 'u1',
    email: 'someone@example.com',
    username: 'someone',
    initials: 'SO',
    plan: 'free',
    isAdmin: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...patch,
  };
}

describe('isAdmin', () => {
  it('returns true for an account the server flagged', () => {
    expect(isAdmin(user({ isAdmin: true }))).toBe(true);
  });

  it('returns false for an ordinary account', () => {
    expect(isAdmin(user())).toBe(false);
  });

  it('returns false when there is no signed-in user', () => {
    expect(isAdmin(undefined)).toBe(false);
    expect(isAdmin(null)).toBe(false);
  });

  /**
   * The handle used to be the whole check, which meant registering the right
   * username was enough to see the owner controls. It is just a name now.
   */
  it('pays no attention to the username', () => {
    expect(isAdmin(user({ username: 'ahsandegreat' }))).toBe(false);
    expect(isAdmin(user({ username: 'admin', isAdmin: true }))).toBe(true);
  });
});
