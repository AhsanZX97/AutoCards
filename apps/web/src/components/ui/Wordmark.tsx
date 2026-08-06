import { cn } from '../../lib/cn';

/** "AutoCards" with the brand gradient on "Auto". `tailClassName` colors "Cards". */
export function Wordmark({
  className,
  tailClassName = 'text-slate-900 dark:text-white',
}: {
  className?: string;
  tailClassName?: string;
}) {
  return (
    <span className={cn('font-display font-bold tracking-tight', className)}>
      <span className="brand-text">Auto</span>
      <span className={tailClassName}>Cards</span>
    </span>
  );
}
