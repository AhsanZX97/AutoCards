import type { Credentials, Plan, Session, SignUpInput, SignUpResult, User } from '../../types';

export interface AuthService {
  signIn(credentials: Credentials): Promise<Session>;
  signUp(input: SignUpInput): Promise<SignUpResult>;
  signOut(): Promise<void>;
  /**
   * Re-validates a session against the provider. Returns null once it has
   * expired.
   *
   * Takes null because the provider, not our persisted copy, is the authority
   * on what is valid — a recovery link establishes a session inside the
   * Supabase client that this app has never stored, and that case has to be
   * answerable.
   */
  restore(session: Session | null): Promise<Session | null>;
  updateProfile(user: User, patch: Partial<Pick<User, 'username' | 'avatarUrl'>>): Promise<User>;
  changePlan(user: User, plan: Plan): Promise<User>;
  /**
   * Sends the "set a new password" email.
   *
   * `redirectTo` is where the link in that email lands, and has to come from
   * the caller: core has no idea what origin it is running on, and the value
   * must also be on the provider's allow-list or the link is refused.
   *
   * Resolves the same way whether or not the address has an account. Reporting
   * that difference would turn this form into a way to test whether somebody
   * is a customer.
   */
  requestPasswordReset(email: string, redirectTo: string): Promise<void>;
  /**
   * Sets a new password for whoever the current session belongs to — either
   * the temporary one a recovery link establishes, or an ordinary signed-in
   * one.
   */
  updatePassword(password: string): Promise<void>;
}

/** Shortest password this app will set. Keep the provider's own minimum in step. */
export const MIN_PASSWORD_LENGTH = 8;

export class AuthError extends Error {
  constructor(
    message: string,
    /** Field the message belongs against, for inline form errors. */
    readonly field?: 'email' | 'password' | 'name',
  ) {
    super(message);
    this.name = 'AuthError';
  }
}
