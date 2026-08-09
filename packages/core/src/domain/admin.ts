import type { User } from '../types';

/**
 * Who gets the owner-only controls.
 *
 * This is a client-side check on a hardcoded handle, so it hides UI rather than
 * protects anything — a username is not a credential and the store it reads
 * from is local. Anything that must actually hold (billing, plan changes that
 * cost money) has to be enforced wherever the money lives.
 */
export const ADMIN_USERNAMES = ['ahsandegreat'] as const;

export function isAdmin(user: User | null | undefined): boolean {
  if (!user) return false;
  const handle = user.username.trim().toLowerCase();
  return (ADMIN_USERNAMES as readonly string[]).includes(handle);
}
