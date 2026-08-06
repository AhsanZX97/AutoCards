import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../../lib/appContext';
import { BrandButton, ThemeToggle } from '../ui';
import { DottedSpotlight } from './DottedSpotlight';

const NAV_LINKS = [
  { href: '#features', label: 'Features' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#how-it-works', label: 'How it works' },
];

function Wordmark({ tailClassName }: { tailClassName: string }) {
  return (
    <span className="font-display font-bold tracking-tight">
      <span className="brand-text">Auto</span>
      <span className={tailClassName}>Cards</span>
    </span>
  );
}

export function MarketingLayout({ children }: { children: ReactNode }) {
  const app = useApp();
  const isAuthed = app.authStore((s) => s.status === 'authenticated');

  return (
    <DottedSpotlight>
      <nav className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-8 py-5">
        <Link to="/" className="text-lg">
          <Wordmark tailClassName="text-slate-800 dark:text-slate-100" />
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
              <BrandButton shape="pillSm">Go to app</BrandButton>
            </Link>
          ) : (
            <>
              <Link
                to="/sign-in"
                className="px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
              >
                Sign in
              </Link>
              <Link to="/sign-up">
                <BrandButton shape="pillSm">Get started free</BrandButton>
              </Link>
            </>
          )}
        </div>
      </nav>

      <main className="relative z-10">{children}</main>

      <footer className="relative z-10 mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 border-t border-slate-100 px-8 py-8 dark:border-slate-800 sm:flex-row">
        <span className="text-sm">
          <Wordmark tailClassName="text-slate-500 dark:text-slate-400" />
        </span>
        <p className="text-xs text-slate-400 dark:text-slate-500">
          © {new Date().getFullYear()} Auto Cards. All rights reserved.
        </p>
        <div className="flex gap-5 text-xs text-slate-400 dark:text-slate-500">
          <a href="#" className="transition-colors hover:text-slate-600 dark:hover:text-slate-300">Privacy</a>
          <a href="#" className="transition-colors hover:text-slate-600 dark:hover:text-slate-300">Terms</a>
          <a href="#" className="transition-colors hover:text-slate-600 dark:hover:text-slate-300">Contact</a>
        </div>
      </footer>
    </DottedSpotlight>
  );
}
