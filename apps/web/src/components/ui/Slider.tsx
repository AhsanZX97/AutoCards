import { cn } from '../../lib/cn';

interface SliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  label?: string;
  formatValue?: (value: number) => string;
  className?: string;
}

export function Slider({ value, min, max, step = 1, onChange, label, formatValue, className }: SliderProps) {
  return (
    <div className={className}>
      {label && (
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{label}</span>
          <span className="text-sm font-semibold text-brand-700 dark:text-brand-400">
            {formatValue ? formatValue(value) : value}
          </span>
        </div>
      )}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={cn(
          'h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-brand-600 dark:bg-slate-700',
        )}
      />
    </div>
  );
}
