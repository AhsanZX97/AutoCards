import { Link } from 'react-router-dom';
import { useT } from '../../lib/i18n';

/**
 * The catch-all route.
 *
 * Without one, an unknown path rendered the layout around an empty hole — and
 * once the host is configured to serve `index.html` for every path (which it
 * has to be, for a single-page app to survive a refresh), that is what a
 * mistyped URL produces. A blank page reads as a broken site.
 */
export function NotFoundPage() {
  const t = useT();
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-24 text-center">
      <span className="text-5xl">🔍</span>
      <h1 className="mt-6 font-display text-3xl font-bold text-slate-900 dark:text-white">
        {t('notFound.title')}
      </h1>
      <p className="mt-3 text-slate-500 dark:text-slate-400">{t('notFound.body')}</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link
          to="/app/decks"
          className="rounded-xl brand-gradient px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90"
        >
          {t('notFound.goToMyDecks')}
        </Link>
        <Link
          to="/"
          className="rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          {t('notFound.backToHome')}
        </Link>
      </div>
    </div>
  );
}
