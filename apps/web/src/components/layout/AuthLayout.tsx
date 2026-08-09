import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Wordmark } from '../ui';

export function AuthLayout({ children, title, subtitle }: { children: ReactNode; title: string; subtitle: string }) {
  return (
    <div className="flex min-h-screen">
      <div className="flex w-full flex-col justify-center px-4 py-12 sm:px-6 lg:w-[480px] lg:flex-none lg:px-16">
        <Link to="/" className="mb-10 inline-block">
          <Wordmark className="text-xl" />
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{title}</h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
        <div className="mt-8">{children}</div>
      </div>
      <div className="relative hidden flex-1 bg-grid bg-slate-950 lg:block">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-950 via-slate-950 to-blue-950" />
        <div className="relative flex h-full flex-col items-center justify-center px-16 text-center">
          <div className="mb-8 flex -space-x-4">
            {['📄', '➡️', '🧠', '➡️', '🃏'].map((emoji, i) => (
              <div
                key={i}
                className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-2xl backdrop-blur"
                style={{ zIndex: 5 - i }}
              >
                {emoji}
              </div>
            ))}
          </div>
          <h2 className="max-w-md text-2xl font-bold text-white">
            Turn your slides and notes into a study-ready flashcard deck
          </h2>
          <p className="mt-3 max-w-sm text-slate-400">
            Upload lecture notes, textbooks, or reports — get customizable, gamified flashcards in seconds.
          </p>
        </div>
      </div>
    </div>
  );
}
