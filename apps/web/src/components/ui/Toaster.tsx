import { cn } from '../../lib/cn';
import { useToastStore } from './toastStore';
import { useT } from '../../lib/i18n';

const VARIANT_CLASSES = {
  success: 'border-emerald-200 dark:border-emerald-500/30',
  error: 'border-rose-200 dark:border-rose-500/30',
  info: 'border-brand-200 dark:border-brand-500/30',
};

const VARIANT_ICON = {
  success: '✅',
  error: '⚠️',
  info: 'ℹ️',
};

export function Toaster() {
  const translate = useT();
  const { toasts, dismiss } = useToastStore();

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            'pointer-events-auto animate-slide-up rounded-xl border bg-white p-4 shadow-soft dark:bg-slate-900',
            VARIANT_CLASSES[toast.variant],
          )}
        >
          <div className="flex items-start gap-2.5">
            <span>{VARIANT_ICON[toast.variant]}</span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">{toast.title}</p>
              {toast.description && <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{toast.description}</p>}
            </div>
            <button
              onClick={() => dismiss(toast.id)}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              aria-label={translate('common.dismiss')}
            >
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
