import { cn } from '../../lib/cn';

interface InfoButtonProps {
  /** Read out in place of the icon, e.g. "What do these card types mean?". */
  label: string;
  onClick: () => void;
  className?: string;
}

/**
 * The ⓘ that sits beside a label whose wording needs a sentence of explaining.
 * It opens a modal rather than a tooltip, so the explanation can carry an
 * example and can be read on a touch screen.
 */
export function InfoButton({ label, onClick, className }: InfoButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        'rounded-full p-0.5 text-slate-400 transition-colors hover:text-brand-600 dark:hover:text-brand-400',
        className,
      )}
    >
      <svg width="15" height="15" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5" />
        <path d="M7 6.3v3.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="7" cy="4.3" r=".7" fill="currentColor" />
      </svg>
    </button>
  );
}
