import type { User } from '../types';

/**
 * Who gets the owner-only controls.
 *
 * This reads a flag on the profile row that the client cannot write — see the
 * column grants in `supabase/schema.sql`. It used to compare against a
 * hardcoded username held in local state, which meant the "admin" controls
 * were guarded by nothing: a username is not a credential, and the plan column
 * they wrote was open to every signed-in user anyway.
 *
 * Even now this only decides what is rendered. The check that matters happens
 * in `admin_set_plan`, which verifies the same flag server-side before it will
 * move anyone's plan.
 */
export function isAdmin(user: User | null | undefined): boolean {
  return user?.isAdmin === true;
}
