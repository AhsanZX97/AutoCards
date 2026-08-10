import type { Id, IsoDate } from './common';

/**
 * `lifetime` is bought once rather than monthly — see `services/billing` and
 * the `payment`-mode branch in `create-checkout-session`. It sits last because
 * the order here is the order the plans are shown in.
 */
export const PLANS = ['free', 'pro', 'lifetime'] as const;
export type Plan = (typeof PLANS)[number];

export interface PlanLimits {
  /** Max generations per month, however many files each reads. `Infinity` for unlimited. */
  monthlyUploads: number;
  /** Max pages accepted in a single PDF. */
  maxPagesPerPdf: number;
  /** Max decks the account may hold. */
  maxDecks: number;
  /** Whether the account may supply its own OpenRouter key. */
  byoKey: boolean;
  /** Whether advanced analytics are unlocked. */
  advancedStats: boolean;
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: {
    monthlyUploads: 5,
    maxPagesPerPdf: 20,
    maxDecks: 3,
    byoKey: false,
    advancedStats: false,
  },
  pro: {
    monthlyUploads: 50,
    maxPagesPerPdf: 50,
    maxDecks: Number.POSITIVE_INFINITY,
    byoKey: true,
    advancedStats: true,
  },
  lifetime: {
    monthlyUploads: Number.POSITIVE_INFINITY,
    // Not infinite, unlike the other two. A single document still has to fit
    // in one model request — see `MAX_CONTEXT_CHARS` in `openRouter.ts` — so
    // advertising "unlimited pages" would be a promise the product breaks in
    // front of the person who believed it.
    maxPagesPerPdf: 2000,
    maxDecks: Number.POSITIVE_INFINITY,
    byoKey: true,
    advancedStats: true,
  },
};

export interface User {
  id: Id;
  email: string;
  /** Unique lowercase handle (a-z0-9_), the student-facing identity. */
  username: string;
  /** Two-letter fallback rendered when there is no avatar image. */
  initials: string;
  avatarUrl?: string;
  plan: Plan;
  /**
   * Set on the profile row, which the client cannot write — see the column
   * grants in `supabase/schema.sql`. Unlocks the comp controls in the UI, and
   * is checked again by `admin_set_plan` where it counts.
   */
  isAdmin: boolean;
  createdAt: IsoDate;
}

export interface Session {
  user: User;
  /** Mock bearer token. Replaced by a real JWT when auth is wired up. */
  token: string;
  expiresAt: IsoDate;
}

export interface Credentials {
  email: string;
  password: string;
}

export interface SignUpInput extends Credentials {
  username: string;
}

/**
 * Sign-up doesn't always yield an authenticated session: a provider that
 * requires email confirmation returns no session until the link is clicked.
 * Callers must branch on `status` rather than assume `session` is present.
 */
export type SignUpResult =
  | { status: 'authenticated'; session: Session }
  | { status: 'confirmation-required'; email: string };
