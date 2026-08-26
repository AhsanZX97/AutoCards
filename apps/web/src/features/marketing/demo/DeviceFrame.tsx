import { useEffect, useRef, type ReactNode } from 'react';
import { useT } from '../../../lib/i18n';

export type DemoDevice = 'desktop' | 'phone';

/**
 * The chrome the walkthrough's screens sit inside — a browser window or a
 * phone.
 *
 * The frames themselves take a `compact` flag rather than relying on Tailwind
 * breakpoints to lay themselves out: a phone-width frame on a desktop viewport
 * still matches `sm:` and `lg:`, so a responsive-by-breakpoint screen would
 * render its desktop layout inside the phone and look nothing like the app.
 */
export function DeviceFrame({ device, path, children }: { device: DemoDevice; path: string; children: ReactNode }) {
  const t = useT();
  const viewport = useRef<HTMLDivElement>(null);

  // Each step is a different screen, so it starts at the top. Without this the
  // frame keeps the previous screen's scroll position and the next one opens
  // halfway down, with its header out of sight.
  useEffect(() => {
    viewport.current?.scrollTo({ top: 0 });
  }, [path, device]);

  if (device === 'phone') {
    return (
      <div className="mx-auto w-full max-w-[380px]">
        <div className="rounded-[2.75rem] border border-slate-300 bg-slate-950 p-3 shadow-2xl shadow-slate-300/50 dark:border-slate-700 dark:shadow-slate-950/60">
          <div className="relative overflow-hidden rounded-[2rem] bg-white dark:bg-slate-950">
            <div className="absolute left-1/2 top-0 z-20 h-6 w-28 -translate-x-1/2 rounded-b-2xl bg-slate-950" />
            <div ref={viewport} className="h-[640px] overflow-y-auto scrollbar-thin">{children}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-300/50 dark:border-slate-800 dark:shadow-slate-950/60">
      <div className="flex items-center gap-3 border-b border-slate-200 bg-slate-100 px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex gap-1.5">
          <span className="h-3 w-3 rounded-full bg-rose-400" />
          <span className="h-3 w-3 rounded-full bg-amber-400" />
          <span className="h-3 w-3 rounded-full bg-emerald-400" />
        </div>
        <span className="mx-auto max-w-xs flex-1 truncate rounded-full bg-white px-4 py-1 text-center text-xs text-slate-400 dark:bg-slate-950 dark:text-slate-500">
          {t('demo.urlBar', { path })}
        </span>
        <div className="w-14" />
      </div>
      <div ref={viewport} className="h-[620px] overflow-y-auto scrollbar-thin bg-slate-50 dark:bg-slate-950">{children}</div>
    </div>
  );
}
