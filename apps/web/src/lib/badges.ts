import type { Difficulty, Priority } from '@autocards/core';

/** Classes only — the label text comes from the `difficulty.*` / `priority.*` catalog keys instead. */
export const DIFFICULTY_BADGE: Record<Difficulty, { classes: string }> = {
  easy: { classes: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' },
  medium: { classes: 'bg-sky-100 text-sky-700 dark:bg-sky-500/10 dark:text-sky-400' },
  hard: { classes: 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400' },
  expert: { classes: 'bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400' },
};

export const PRIORITY_BADGE: Record<Priority, { classes: string }> = {
  low: { classes: 'bg-slate-100 text-slate-600 dark:bg-slate-500/10 dark:text-slate-400' },
  normal: { classes: 'bg-slate-100 text-slate-700 dark:bg-slate-500/10 dark:text-slate-300' },
  high: { classes: 'bg-violet-100 text-violet-700 dark:bg-violet-500/10 dark:text-violet-400' },
  critical: { classes: 'bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400' },
};
