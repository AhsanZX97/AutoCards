import type { Accent } from '@autocards/core';

export interface AccentClasses {
  bg: string;
  bgSoft: string;
  text: string;
  border: string;
  ring: string;
  gradient: string;
  dot: string;
}

/**
 * Full Tailwind class names per accent, kept as static literals (not
 * interpolated) so the JIT compiler can see and keep every one of them.
 */
export const ACCENT_CLASSES: Record<Accent, AccentClasses> = {
  indigo: {
    bg: 'bg-indigo-600',
    bgSoft: 'bg-indigo-50 dark:bg-indigo-500/10',
    text: 'text-indigo-600 dark:text-indigo-400',
    border: 'border-indigo-200 dark:border-indigo-500/30',
    ring: 'ring-indigo-500',
    gradient: 'from-indigo-500 to-violet-500',
    dot: 'bg-indigo-500',
  },
  violet: {
    bg: 'bg-violet-600',
    bgSoft: 'bg-violet-50 dark:bg-violet-500/10',
    text: 'text-violet-600 dark:text-violet-400',
    border: 'border-violet-200 dark:border-violet-500/30',
    ring: 'ring-violet-500',
    gradient: 'from-violet-500 to-fuchsia-500',
    dot: 'bg-violet-500',
  },
  sky: {
    bg: 'bg-sky-600',
    bgSoft: 'bg-sky-50 dark:bg-sky-500/10',
    text: 'text-sky-600 dark:text-sky-400',
    border: 'border-sky-200 dark:border-sky-500/30',
    ring: 'ring-sky-500',
    gradient: 'from-sky-500 to-indigo-500',
    dot: 'bg-sky-500',
  },
  emerald: {
    bg: 'bg-emerald-600',
    bgSoft: 'bg-emerald-50 dark:bg-emerald-500/10',
    text: 'text-emerald-600 dark:text-emerald-400',
    border: 'border-emerald-200 dark:border-emerald-500/30',
    ring: 'ring-emerald-500',
    gradient: 'from-emerald-500 to-teal-500',
    dot: 'bg-emerald-500',
  },
  amber: {
    bg: 'bg-amber-500',
    bgSoft: 'bg-amber-50 dark:bg-amber-500/10',
    text: 'text-amber-600 dark:text-amber-400',
    border: 'border-amber-200 dark:border-amber-500/30',
    ring: 'ring-amber-500',
    gradient: 'from-amber-400 to-orange-500',
    dot: 'bg-amber-500',
  },
  rose: {
    bg: 'bg-rose-600',
    bgSoft: 'bg-rose-50 dark:bg-rose-500/10',
    text: 'text-rose-600 dark:text-rose-400',
    border: 'border-rose-200 dark:border-rose-500/30',
    ring: 'ring-rose-500',
    gradient: 'from-rose-500 to-pink-500',
    dot: 'bg-rose-500',
  },
  teal: {
    bg: 'bg-teal-600',
    bgSoft: 'bg-teal-50 dark:bg-teal-500/10',
    text: 'text-teal-600 dark:text-teal-400',
    border: 'border-teal-200 dark:border-teal-500/30',
    ring: 'ring-teal-500',
    gradient: 'from-teal-500 to-emerald-500',
    dot: 'bg-teal-500',
  },
  slate: {
    bg: 'bg-slate-600',
    bgSoft: 'bg-slate-100 dark:bg-slate-500/10',
    text: 'text-slate-600 dark:text-slate-400',
    border: 'border-slate-200 dark:border-slate-500/30',
    ring: 'ring-slate-500',
    gradient: 'from-slate-500 to-slate-700',
    dot: 'bg-slate-500',
  },
};

export function accentOf(accent: Accent | undefined): AccentClasses {
  return ACCENT_CLASSES[accent ?? 'indigo'];
}
