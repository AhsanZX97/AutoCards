import type { Credentials, Plan, Session, SignUpInput, SignUpResult, User } from '../../types';

export interface AuthService {
  signIn(credentials: Credentials): Promise<Session>;
  /**
   * `redirectTo` is where a confirmation email's link lands, on platforms that
   * need it to land somewhere other than `site_url` — see the same argument on
   * `requestPasswordReset`. Omitted, the provider falls back to `site_url`.
   */
  signUp(input: SignUpInput, redirectTo?: string): Promise<SignUpResult>;
  /**
   * Hands off to Google, which sends the browser back to `redirectTo` with the
   * session attached.
   *
   * Resolving means the hand-off was accepted, not that anyone signed in — the
   * page is on its way out by then, and the session arrives on the return trip
   * through `restore({ fromProvider: true })`. Only a refusal (the provider is
   * switched off, the origin is not allow-listed) comes back as a throw.
   *
   * `redirectTo` comes from the caller for the same reason it does on
   * `requestPasswordReset`: core does not know its own origin, and the value
   * has to be on the provider's allow-list.
   *
   * No email confirmation follows, and none is skipped: Google has already
   * verified the address it hands over, which is the thing our own confirmation
   * email exists to establish.
   *
   * Only usable where the platform itself can navigate away and come back — a
   * browser tab. Platforms that have to drive an in-app browser session
   * themselves instead use `startGoogleSignIn` + `restoreFromUrl`.
   */
  signInWithGoogle(redirectTo: string): Promise<void>;
  /**
   * The same Google hand-off as `signInWithGoogle`, but returns the authorize
   * URL instead of leaving the page — for a platform with no page to leave,
   * which has to open that URL itself (an in-app browser session) and catch
   * the return trip, rather than letting the browser navigate on its own.
   *
   * The session is not established by this call. Pass the URL the browser
   * session comes back with to `restoreFromUrl`.
   */
  startGoogleSignIn(redirectTo: string): Promise<string>;
  /**
   * Establishes a session from a URL carrying tokens or an auth code — the
   * landing point for a deep link, where (unlike a browser tab) nothing picks
   * the session out of the URL on its own. Covers Google's return trip and a
   * confirmation/recovery email's link alike, since both arrive the same way:
   * a URL with either `access_token`+`refresh_token` or `code` in its query
   * string or fragment.
   *
   * Resolves to null when the URL carries nothing usable, rather than
   * throwing — a stale or already-used link is an everyday outcome here, not
   * an error. An explicit `error`/`error_description` in the URL (the
   * provider's own refusal) still throws.
   */
  restoreFromUrl(url: string): Promise<Session | null>;
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
