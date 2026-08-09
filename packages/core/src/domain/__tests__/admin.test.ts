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
    createdAt: '2026-01-01T00:00:00.000Z',
    ...patch,
  };
}

describe('isAdmin', () => {
  it('returns true for the owner account', () => {
    expect(isAdmin(user({ username: 'ahsandegreat' }))).toBe(true);
  });

  it('returns false for any other account', () => {
    expect(isAdmin(user({ username: 'someone' }))).toBe(false);
  });

  it('ignores casing and surrounding whitespace on the username', () => {
    expect(isAdmin(user({ username: ' AhsanDeGreat ' }))).toBe(true);
  });

  it('returns false when there is no signed-in user', () => {
    expect(isAdmin(undefined)).toBe(false);
    expect(isAdmin(null)).toBe(false);
  });

  it('does not match a username that merely contains the admin handle', () => {
    expect(isAdmin(user({ username: 'notahsandegreat' }))).toBe(false);
  });
});
