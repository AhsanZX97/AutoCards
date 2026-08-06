import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export type BrandButtonVariant = 'primary' | 'secondary';
export type BrandButtonShape = 'pill' | 'pillSm' | 'block';

interface BrandButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BrandButtonVariant;
  shape?: BrandButtonShape;
}

const VARIANT_CLASSES: Record<BrandButtonVariant, string> = {
  primary: 'brand-gradient text-white shadow-brand hover:opacity-90',
  secondary:
    'border border-slate-200 bg-white/80 text-slate-600 backdrop-blur-sm hover:border-slate-300 hover:bg-white dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-900',
};

const SHAPE_CLASSES: Record<BrandButtonShape, string> = {
  pill: 'rounded-full px-7 py-3.5 text-sm',
  pillSm: 'rounded-full px-5 py-2.5 text-sm',
  block: 'w-full justify-center rounded-xl py-3 text-sm',
};

/** Gradient-brand call to action used across the marketing surface. */
export const BrandButton = forwardRef<HTMLButtonElement, BrandButtonProps>(function BrandButton(
  { variant = 'primary', shape = 'pill', className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center gap-2 font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950',
        VARIANT_CLASSES[variant],
        SHAPE_CLASSES[shape],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});
