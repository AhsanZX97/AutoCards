import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useT } from '../../lib/i18n';

export function LegalPageLayout({
  title,
  lastUpdated,
  children,
}: {
  title: string;
  lastUpdated: string;
  children: ReactNode;
}) {
  const t = useT();
  return (
    <div className="mx-auto max-w-3xl px-6 py-20">
      <Link
        to="/"
        className="text-sm font-medium text-slate-400 transition-colors hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
      >
        {t('legal.backToAutoCards')}
      </Link>
      <h1 className="mt-6 font-display text-4xl font-bold tracking-tight text-slate-900 dark:text-white">
        {title}
      </h1>
      <p className="mt-2 text-sm text-slate-400 dark:text-slate-500">{t('legal.lastUpdated', { date: lastUpdated })}</p>
      <div className="mt-10 space-y-8 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
        {children}
      </div>
    </div>
  );
}

export function LegalSection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-lg font-semibold text-slate-900 dark:text-white">{heading}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
