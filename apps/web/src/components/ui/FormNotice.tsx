import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

interface FormNoticeProps {
  variant?: 'error' | 'warning' | 'info';
  children: ReactNode;
  className?: string;
}

const VARIANT_CLASSES: Record<NonNullable<FormNoticeProps['variant']>, string> = {
  error: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-400',
  warning: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400',
  info: 'border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-400',
};

const VARIANT_ICONS: Record<NonNullable<FormNoticeProps['variant']>, string> = {
  error: '⚠',
  warning: '⚠',
  info: 'ℹ',
};

/**
 * Inline explanation of why the thing in front of the user will not work —
 * a blocked action, an empty result, a bad combination of inputs.
 *
 * Sits next to the control it is about, unlike a toast, so it stays on screen
 * for as long as the problem does. `role="alert"` so a screen reader announces
 * it when it appears.
 */
export function FormNotice({ variant = 'error', children, className }: FormNoticeProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex items-start gap-2 rounded-xl border px-4 py-3 text-sm font-medium',
        VARIANT_CLASSES[variant],
        className,
      )}
    >
      <span aria-hidden="true">{VARIANT_ICONS[variant]}</span>
      <span>{children}</span>
    </div>
  );
}
