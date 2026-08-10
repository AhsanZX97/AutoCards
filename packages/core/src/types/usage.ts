/**
 * How much of a plan's monthly allowance an account has spent.
 *
 * Counted per calendar month in UTC. `period` is what makes the reset free:
 * rather than scheduling anything, a read that finds a stale period treats the
 * count as zero — see `usageForPeriod`.
 */
export interface UploadUsage {
  /** `YYYY-MM`, UTC. The month `uploads` was counted in. */
  period: string;
  /** Generations run during `period`. */
  uploads: number;
}

/**
 * The same count as the server holds it, handed back with a generation.
 *
 * The client keeps its own tally for the meter, but that one lives in storage
 * the user can clear. When a generation goes through the server the reply
 * carries the number that actually decides, and the local count is corrected
 * to match rather than incremented blindly.
 */
export interface UploadQuotaSnapshot extends UploadUsage {
  /** The plan's monthly allowance, or `null` when it is unlimited. */
  limit: number | null;
}
