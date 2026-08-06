import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

interface ChipProps {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}

export function Chip({ active, onClick, children, className }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
        active
          ? 'border-brand-600 bg-brand-600 text-white'
          : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600',
        className,
      )}
    >
      {children}
    </button>
  );
}
