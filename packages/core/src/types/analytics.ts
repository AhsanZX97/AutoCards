import type { IsoDate } from './common';
import type { StudyMode } from './study';
import type { Plan } from './user';

/**
 * The owner's analytics report, exactly as `admin_analytics` returns it.
 *
 * Every field here is server-computed — the function reads across all accounts,
 * which nothing in the browser can do — so this is a transcript rather than
 * something the client derives. `null` means "no data", never zero: an average
 * of no sessions is not 0%, and a chart that draws it as one invents a
 * collapse that never happened.
 *
 * The SQL that produces it is `supabase/migrations/0014_admin_analytics.sql`,
 * and the loose snippets it grew from are in `supabase/analytics.sql`.
 */
export interface AnalyticsReport {
  /** When the server built this payload. */
  generatedAt: IsoDate;
  /** Width of the window in days, including today. */
  days: number;
  /** The zone days were cut on — 'UTC' if the requested one was not recognised. */
  timeZone: string;
  /** First day of the window, `YYYY-MM-DD` in `timeZone`. */
  from: string;
  /** Last day of the window — today, and always partial. */
  to: string;
  current: AnalyticsTotals;
  /** The equally-long window immediately before this one, for like-for-like deltas. */
  previous: AnalyticsTotals;
  daily: AnalyticsDay[];
  sessionShape: AnalyticsSessionShape;
  modes: AnalyticsModeRow[];
  topDecks: AnalyticsDeckRow[];
  funnel: AnalyticsFunnel;
  activation: AnalyticsActivationDay[];
  stalled: AnalyticsStalledRow[];
  providers: AnalyticsProviderRow[];
  signIns: AnalyticsSignIns;
  subscriptions: AnalyticsSubscriptions;
  planMix: AnalyticsPlanRow[];
  renewals: AnalyticsRenewalRow[];
  usage: AnalyticsUsage;
  topUploaders: AnalyticsUploaderRow[];
  models: AnalyticsModelRow[];
  reminders: AnalyticsReminders;
  lifetime: AnalyticsLifetime;
}

export interface AnalyticsTotals {
  signups: number;
  /** Distinct accounts that finished a session. The honest activity number. */
  learners: number;
  sessions: number;
  cardsStudied: number;
  decksCreated: number;
  cardsCreated: number;
  /**
   * Decks carrying a `generatedBy`, by their client-written `createdAt`. Close
   * to the OpenRouter spend but not exact — see `usage` for the figure to put
   * next to an invoice.
   */
  generations: number;
  /** Mean session accuracy as a percentage, or null when nothing was studied. */
  accuracy: number | null;
}

export interface AnalyticsDay {
  /** `YYYY-MM-DD` in the report's zone. */
  date: string;
  signups: number;
  learners: number;
  sessions: number;
  cardsStudied: number;
  decksCreated: number;
  cardsCreated: number;
  generations: number;
  accuracy: number | null;
  /** Stripe webhook deliveries. A silent day with live subscriptions is a fault. */
  stripeEvents: number;
}

export interface AnalyticsSessionShape {
  sessions: number;
  avgCards: number | null;
  avgMinutes: number | null;
  avgAccuracy: number | null;
}

export interface AnalyticsModeRow {
  mode: StudyMode | string;
  sessions: number;
  accuracy: number | null;
}

export interface AnalyticsDeckRow {
  /** Denormalised into the session summary, so deleted decks still appear. */
  deck: string;
  sessions: number;
  cardsAnswered: number;
}

/** Accounts created in the window, by how far each one got. */
export interface AnalyticsFunnel {
  signedUp: number;
  builtADeck: number;
  studiedOnce: number;
  studied3Plus: number;
}

export interface AnalyticsActivationDay {
  date: string;
  signedUp: number;
  /** Of those, how many studied within a day of joining. */
  activated: number;
}

export interface AnalyticsStalledRow {
  username: string;
  signedUp: IsoDate;
  hasADeck: boolean;
}

export interface AnalyticsProviderRow {
  /** `email`, `google`, … */
  provider: string;
  signups: number;
  confirmed: number;
}

export interface AnalyticsSignIns {
  signedInToday: number;
  signedInWindow: number;
  accounts: number;
  unconfirmed: number;
}

export interface AnalyticsSubscriptions {
  active: number;
  trialing: number;
  pastDue: number;
  /** Still paying, already decided to leave. The earliest churn signal there is. */
  cancelling: number;
  touchedThisWindow: number;
}

export interface AnalyticsPlanRow {
  plan: Plan | string;
  users: number;
}

export interface AnalyticsRenewalRow {
  username: string;
  plan: string;
  status: string;
  renewsOn: IsoDate;
  leaving: boolean;
}

export interface AnalyticsUsage {
  /** `YYYY-MM` in UTC — the allowance period, not the chart window. */
  period: string;
  uploads: number;
  usersWhoGenerated: number;
  heaviestSingleUser: number;
}

export interface AnalyticsUploaderRow {
  username: string;
  plan: string;
  uploads: number;
}

export interface AnalyticsModelRow {
  /** The model id, or `(hand-written)` for decks nothing generated. */
  model: string;
  decks: number;
}

export interface AnalyticsReminders {
  firedThisWindow: number;
  byEmail: number;
  pushOnly: number;
  createdThisWindow: number;
  notScheduled: number;
  /** Growing means the `send-reminders` cron is failing silently. */
  overdue: number;
  scheduled: number;
}

export interface AnalyticsLifetime {
  accounts: number;
  decks: number;
  cards: number;
  sessions: number;
  cardsStudied: number;
  paidAccounts: number;
}
