import { Link } from 'react-router-dom';
import { BrandButton } from '../../../components/ui';
import { useT } from '../../../lib/i18n';

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="mt-0.5 shrink-0" aria-hidden="true">
      <circle cx="7" cy="7" r="7" fill="rgb(100 116 139 / 0.12)" />
      <path d="M4 7l2 2 4-4" stroke="rgb(100 116 139)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * /vs/knowt — a fair comparison, not sales copy.
 *
 * Knowt's free-tier breadth (AI generation, summarizers, practice tests,
 * Quizlet import all included free) is a real advantage and stated as such.
 */
export function VsKnowtPage() {
  const t = useT();
  const competitorPoints = [
    t('compare.knowt.competitor.point1'),
    t('compare.knowt.competitor.point2'),
    t('compare.knowt.competitor.point3'),
  ];
  const autocardsPoints = [
    t('compare.knowt.autocards.point1'),
    t('compare.knowt.autocards.point2'),
    t('compare.knowt.autocards.point3'),
  ];

  return (
    <div className="mx-auto max-w-4xl px-6 py-20">
      <section className="flex flex-col items-center text-center">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-cyan-500/25 px-4 py-1.5 text-xs font-semibold tracking-wide text-cyan-600 brand-tint dark:text-cyan-400">
          <span className="h-1.5 w-1.5 rounded-full brand-gradient" />
          {t('compare.knowt.eyebrow')}
        </div>
        <h1 className="mb-5 max-w-2xl font-display text-4xl font-bold tracking-tight text-slate-900 dark:text-white md:text-5xl">
          {t('compare.knowt.h1')}
        </h1>
        <p className="max-w-xl text-lg leading-relaxed text-slate-500 dark:text-slate-400">{t('compare.knowt.subtitle')}</p>
      </section>

      <section className="mt-16 grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-100 bg-white/60 p-6 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/60">
          <h2 className="mb-4 font-display text-sm font-semibold text-slate-800 dark:text-slate-100">
            {t('compare.knowt.competitor.heading')}
          </h2>
          <ul className="space-y-3">
            {competitorPoints.map((point) => (
              <li key={point} className="flex items-start gap-2.5 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                <CheckIcon />
                {point}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border border-cyan-500/25 p-6 brand-tint">
          <h2 className="mb-4 font-display text-sm font-semibold text-slate-800 dark:text-slate-100">
            {t('compare.winsForAutoCards')}
          </h2>
          <ul className="space-y-3">
            {autocardsPoints.map((point) => (
              <li key={point} className="flex items-start gap-2.5 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="mt-0.5 shrink-0" aria-hidden="true">
                  <circle cx="7" cy="7" r="7" fill="rgb(6 182 212 / 0.15)" />
                  <path d="M4 7l2 2 4-4" stroke="rgb(8 145 178)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {point}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mt-10 rounded-2xl border border-slate-200 bg-slate-50/60 p-6 dark:border-slate-800 dark:bg-slate-900/40">
        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">{t('compare.knowt.verdict')}</p>
      </section>

      <div className="mt-14 flex justify-center">
        <Link to="/demo">
          <BrandButton>{t('compare.cta')}</BrandButton>
        </Link>
      </div>
    </div>
  );
}
