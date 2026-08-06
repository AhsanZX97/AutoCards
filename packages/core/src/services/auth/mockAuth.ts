import { createId } from '../../lib/id';
import { addDays, nowIso } from '../../lib/date';
import { initialsOf } from '../../lib/text';
import type { Credentials, Plan, Session, SignUpInput, User } from '../../types';

export interface AuthService {
  readonly isMock: boolean;
  signIn(credentials: Credentials): Promise<Session>;
  signUp(input: SignUpInput): Promise<Session>;
  signOut(): Promise<void>;
  /** Re-validates a persisted session. Returns null once it has expired. */
  restore(session: Session): Promise<Session | null>;
  updateProfile(user: User, patch: Partial<Pick<User, 'name' | 'avatarUrl'>>): Promise<User>;
  changePlan(user: User, plan: Plan): Promise<User>;
}

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

/** Pre-filled on the sign-in form so the app can be opened without signing up. */
export const DEMO_CREDENTIALS: Credentials = {
  email: 'demo@autocards.app',
  password: 'demo1234',
};

const SESSION_DAYS = 30;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(email: string, password: string, name?: string): void {
  if (!EMAIL_PATTERN.test(email)) {
    throw new AuthError('That does not look like a valid email address.', 'email');
  }
  if (password.length < 8) {
    throw new AuthError('Password must be at least 8 characters.', 'password');
  }
  if (name !== undefined && name.trim().length < 2) {
    throw new AuthError('Please enter your name.', 'name');
  }
}

function nameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? 'there';
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ');
}

function makeSession(user: User): Session {
  return {
    user,
    token: `mock_${createId()}`,
    expiresAt: addDays(new Date(), SESSION_DAYS).toISOString(),
  };
}

/**
 * Stand-in for a real auth backend.
 *
 * Accepts any well-formed email with an 8+ character password and mints a local
 * session. No account is stored server-side, so signing in twice with the same
 * email produces a new user id — fine for a single-device demo, and the reason
 * this needs replacing before anything real ships.
 */
export class MockAuthService implements AuthService {
  readonly isMock = true;

  constructor(private readonly latencyMs = 650) {}

  private async pause(): Promise<void> {
    if (this.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.latencyMs));
    }
  }

  async signIn({ email, password }: Credentials): Promise<Session> {
    await this.pause();
    const normalized = email.trim().toLowerCase();
    validate(normalized, password);

    // The demo account is the one place a wrong password is rejected, so the
    // error path is reachable without inventing a user store.
    if (normalized === DEMO_CREDENTIALS.email && password !== DEMO_CREDENTIALS.password) {
      throw new AuthError('Incorrect password for the demo account.', 'password');
    }

    const isDemo = normalized === DEMO_CREDENTIALS.email;
    const name = isDemo ? 'Demo Learner' : nameFromEmail(normalized);
    return makeSession({
      id: createId('usr'),
      email: normalized,
      name,
      initials: initialsOf(name),
      plan: isDemo ? 'pro' : 'free',
      createdAt: nowIso(),
    });
  }

  async signUp({ email, password, name }: SignUpInput): Promise<Session> {
    await this.pause();
    const normalized = email.trim().toLowerCase();
    validate(normalized, password, name);

    if (normalized === DEMO_CREDENTIALS.email) {
      throw new AuthError('That email is already registered. Try signing in.', 'email');
    }

    const trimmed = name.trim();
    return makeSession({
      id: createId('usr'),
      email: normalized,
      name: trimmed,
      initials: initialsOf(trimmed),
      plan: 'free',
      createdAt: nowIso(),
    });
  }

  async signOut(): Promise<void> {
    await this.pause();
  }

  async restore(session: Session): Promise<Session | null> {
    if (new Date(session.expiresAt).getTime() <= Date.now()) return null;
    return session;
  }

  async updateProfile(
    user: User,
    patch: Partial<Pick<User, 'name' | 'avatarUrl'>>,
  ): Promise<User> {
    await this.pause();
    const name = patch.name?.trim() || user.name;
    return { ...user, ...patch, name, initials: initialsOf(name) };
  }

  async changePlan(user: User, plan: Plan): Promise<User> {
    await this.pause();
    return { ...user, plan };
  }
}
