import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../../lib/appContext';
import { useT } from '../../lib/i18n';
import { BrandButton, ThemeToggle, Wordmark } from '../ui';
import { DottedSpotlight } from './DottedSpotlight';

export function MarketingLayout({ children }: { children: ReactNode }) {
  const app = useApp();
  const t = useT();
  const isAuthed = app.authStore((s) => s.status === 'authenticated');
  const NAV_LINKS = [
    { href: '#features', label: t('nav.marketing.features') },
    { href: '#pricing', label: t('nav.marketing.pricing') },
    { href: '#how-it-works', label: t('nav.marketing.howItWorks') },
  ];

  return (
    <DottedSpotlight>
      <nav className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-8 py-5">
        <Link to="/">
          <Wordmark className="text-lg" tailClassName="text-slate-800 dark:text-slate-100" />
        </Link>

        <div className="hidden items-center gap-8 text-sm font-medium text-slate-500 dark:text-slate-400 md:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="transition-colors hover:text-slate-800 dark:hover:text-slate-100"
            >
              {link.label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <ThemeToggle />
          {isAuthed ? (
            <Link to="/app">
              <BrandButton shape="pillSm">{t('nav.marketing.goToApp')}</BrandButton>
            </Link>
          ) : (
            <>
              <Link
                to="/sign-in"
                className="px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
              >
                {t('nav.marketing.signIn')}
              </Link>
              <Link to="/sign-up">
                <BrandButton shape="pillSm">{t('nav.marketing.getStarted')}</BrandButton>
              </Link>
            </>
          )}
        </div>
      </nav>

      <main className="relative z-10">{children}</main>

      <footer className="relative z-10 mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 border-t border-slate-100 px-8 py-8 dark:border-slate-800 sm:flex-row">
        <Wordmark className="text-sm" tailClassName="text-slate-500 dark:text-slate-400" />
        <p className="text-xs text-slate-400 dark:text-slate-500">
          {t('nav.marketing.allRightsReserved', { year: new Date().getFullYear() })}
        </p>
        <div className="flex gap-5 text-xs text-slate-400 dark:text-slate-500">
          <Link to="/privacy" className="transition-colors hover:text-slate-600 dark:hover:text-slate-300">{t('nav.marketing.privacy')}</Link>
          <Link to="/terms" className="transition-colors hover:text-slate-600 dark:hover:text-slate-300">{t('nav.marketing.terms')}</Link>
          <a
            href="mailto:autocardssupport@gmail.com"
            className="transition-colors hover:text-slate-600 dark:hover:text-slate-300"
          >
            {t('nav.marketing.contact')}
          </a>
        </div>
      </footer>
    </DottedSpotlight>
  );
}
