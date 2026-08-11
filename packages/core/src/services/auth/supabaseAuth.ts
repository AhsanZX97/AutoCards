import type {
  Session as SupabaseSession,
  SupabaseClient,
  User as SupabaseUser,
} from '@supabase/supabase-js';
import { initialsOf, isValidUsername, normalizeUsername } from '../../lib/text';
import type { Credentials, Plan, Session, SignUpInput, SignUpResult, User } from '../../types';
import { AuthError, MIN_PASSWORD_LENGTH } from './types';
import type { AuthService } from './types';

interface ProfileRow {
  id: string;
  username: string;
  avatar_url: string | null;
  plan: Plan;
  is_admin: boolean | null;
  created_at: string;
}

function toUser(authUser: SupabaseUser, profile: ProfileRow): User {
  return {
    id: authUser.id,
    email: authUser.email ?? '',
    username: profile.username,
    initials: initialsOf(profile.username),
    avatarUrl: profile.avatar_url ?? undefined,
    plan: profile.plan,
    isAdmin: profile.is_admin === true,
    createdAt: profile.created_at,
  };
}

function toSession(supabaseSession: SupabaseSession, user: User): Session {
  return {
    user,
    token: supabaseSession.access_token,
    expiresAt: new Date((supabaseSession.expires_at ?? 0) * 1000).toISOString(),
  };
}

/**
 * Real auth against Supabase. The `profiles` row (name/avatar/plan) is
 * created server-side by a trigger on `auth.users` insert — see
 * `supabase/schema.sql` — so sign-up never has to insert it itself.
 */
export class SupabaseAuthService implements AuthService {
  constructor(private readonly client: SupabaseClient) {}

  private async fetchProfile(userId: string): Promise<ProfileRow> {
    const { data, error } = await this.client
      .from('profiles')
      .select('id,username,avatar_url,plan,is_admin,created_at')
      .eq('id', userId)
      .single();
    if (error || !data) throw new AuthError('Could not load your profile.');
    return data as ProfileRow;
  }

  async signIn({ email, password }: Credentials): Promise<Session> {
    const { data, error } = await this.client.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error || !data.session || !data.user) {
      throw new AuthError(error?.message ?? 'Sign in failed.', 'password');
    }
    const profile = await this.fetchProfile(data.user.id);
    return toSession(data.session, toUser(data.user, profile));
  }

  async signUp({ email, password, username }: SignUpInput): Promise<SignUpResult> {
    const normalizedEmail = email.trim().toLowerCase();
    const handle = normalizeUsername(username);
    if (!isValidUsername(handle)) {
      throw new AuthError('Usernames use 3–20 lowercase letters, numbers and underscores.', 'name');
    }
    const { data, error } = await this.client.auth.signUp({
      email: normalizedEmail,
      password,
      options: { data: { username: handle } },
    });
    if (error) {
      if (isUniqueViolation(error.message)) {
        throw new AuthError('That username is already taken.', 'name');
      }
      throw new AuthError(error.message, 'email');
    }

    // No session means the project requires email confirmation — the caller
    // must show a "check your email" state instead of navigating in.
    if (!data.session || !data.user) {
      return { status: 'confirmation-required', email: normalizedEmail };
    }
    const profile = await this.fetchProfile(data.user.id);
    return { status: 'authenticated', session: toSession(data.session, toUser(data.user, profile)) };
  }

  /**
   * Starts the Google redirect. The `profiles` row is still the trigger's job —
   * see `supabase/migrations/0008_oauth_usernames.sql`, which derives a handle,
   * since Google sends a name and an email but never a username.
   */
  async signInWithGoogle(redirectTo: string): Promise<void> {
    const { error } = await this.client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    });
    // Only reached when the hand-off itself was refused — on success the
    // browser is already leaving for Google.
    if (error) throw new AuthError(error.message);
  }

  async signOut(): Promise<void> {
    const { error } = await this.client.auth.signOut();
    if (error) throw error;
  }

  /**
   * Deliberately silent about whether the address has an account.
   *
   * Supabase already answers the same way either way, and this keeps it that
   * way: a form that said "no account with that email" would let anyone check
   * whether a given person is a customer. Errors are logged rather than shown,
   * so a provider outage does not read to the user as "wrong email".
   */
  async requestPasswordReset(email: string, redirectTo: string): Promise<void> {
    const { error } = await this.client.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo,
    });
    if (error) console.error('[autocards] could not send the reset email', error);
  }

  async updatePassword(password: string): Promise<void> {
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new AuthError(
        `Use at least ${MIN_PASSWORD_LENGTH} characters.`,
        'password',
      );
    }
    const { error } = await this.client.auth.updateUser({ password });
    if (error) {
      // The usual cause is an expired or already-used recovery link — the user
      // needs a fresh email rather than another go at the same form.
      throw new AuthError(
        /expired|invalid|not authenticated|session/i.test(error.message)
          ? 'That reset link has expired. Ask for a new one and try again.'
          : error.message,
        'password',
      );
    }
  }

  /**
   * Ignores the locally-cached session passed in — the Supabase client
   * silently refreshes tokens in the background and is the source of truth
   * for whether a session is still valid, not our own persisted copy.
   */
  async restore(): Promise<Session | null> {
    const { data, error } = await this.client.auth.getSession();
    if (error || !data.session) return null;
    const profile = await this.fetchProfile(data.session.user.id);
    return toSession(data.session, toUser(data.session.user, profile));
  }

  async updateProfile(
    user: User,
    patch: Partial<Pick<User, 'username' | 'avatarUrl'>>,
  ): Promise<User> {
    const update: Record<string, string> = {};
    if ('avatarUrl' in patch) update.avatar_url = patch.avatarUrl ?? '';
    if (patch.username) {
      const handle = normalizeUsername(patch.username);
      if (!isValidUsername(handle)) {
        throw new AuthError('Usernames use 3–20 lowercase letters, numbers and underscores.', 'name');
      }
      update.username = handle;
    }
    if (Object.keys(update).length === 0) return user;
    const { data, error } = await this.client
      .from('profiles')
      .update(update)
      .eq('id', user.id)
      .select('id,username,avatar_url,plan,is_admin,created_at')
      .single();
    if (error) {
      if (isUniqueViolation(error.message)) {
        throw new AuthError('That username is already taken.', 'name');
      }
      throw new AuthError('Could not update your profile.');
    }
    const profile = data as ProfileRow;
    return {
      ...user,
      username: profile.username,
      initials: initialsOf(profile.username),
      avatarUrl: profile.avatar_url ?? undefined,
    };
  }

  /**
   * The comp path, for support and testing.
   *
   * Goes through `admin_set_plan` rather than writing the column, because the
   * client is no longer allowed to write it — that was how anyone could hand
   * themselves an unlimited allowance. The function checks `is_admin` itself,
   * so a non-admin calling this gets an error rather than a plan.
   */
  async changePlan(user: User, plan: Plan): Promise<User> {
    const { error } = await this.client.rpc('admin_set_plan', { p_user: user.id, p_plan: plan });
    if (error) throw new AuthError('Could not update your plan.');
    return { ...user, plan };
  }
}

/** Best-effort mapping of a Postgres unique-violation message (the trigger
 *  that creates the profile stores the username, so a taken handle rejects at
 *  sign-up/update time). The DB constraint is the real guard. */
function isUniqueViolation(message?: string): boolean {
  return /duplicate key value violates unique constraint|already taken|23505/i.test(message ?? '');
}
