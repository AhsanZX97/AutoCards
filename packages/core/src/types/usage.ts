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
