import type { Credentials, Plan, Session, SignUpInput, SignUpResult, User } from '../../types';

export interface AuthService {
  signIn(credentials: Credentials): Promise<Session>;
  signUp(input: SignUpInput): Promise<SignUpResult>;
  signOut(): Promise<void>;
  /** Re-validates a persisted session. Returns null once it has expired. */
  restore(session: Session): Promise<Session | null>;
  updateProfile(user: User, patch: Partial<Pick<User, 'username' | 'avatarUrl'>>): Promise<User>;
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
