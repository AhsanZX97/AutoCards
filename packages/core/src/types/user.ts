import type { Id, IsoDate } from './common';

export const PLANS = ['free', 'pro', 'team'] as const;
export type Plan = (typeof PLANS)[number];

export interface PlanLimits {
  /** Max PDFs that can be converted per month. `Infinity` for unlimited. */
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
    monthlyUploads: 200,
    maxPagesPerPdf: 500,
    maxDecks: Number.POSITIVE_INFINITY,
    byoKey: true,
    advancedStats: true,
  },
  team: {
    monthlyUploads: Number.POSITIVE_INFINITY,
    maxPagesPerPdf: 2000,
    maxDecks: Number.POSITIVE_INFINITY,
    byoKey: true,
    advancedStats: true,
  },
};

export interface User {
  id: Id;
  email: string;
  name: string;
  /** Two-letter fallback rendered when there is no avatar image. */
  initials: string;
  avatarUrl?: string;
  plan: Plan;
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
  name: string;
}
