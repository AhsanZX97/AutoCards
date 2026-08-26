import { Link } from 'react-router-dom';
import type { Translator } from '@autocards/core';
import { BrandButton } from '../../../components/ui';
import { useT } from '../../../lib/i18n';

function steps(t: Translator) {
  return [
    { step: '01', title: t('useCase.pdf.step.upload.title'), description: t('useCase.pdf.step.upload.description') },
    { step: '02', title: t('useCase.pdf.step.read.title'), description: t('useCase.pdf.step.read.description') },
    { step: '03', title: t('useCase.pdf.step.generate.title'), description: t('useCase.pdf.step.generate.description') },
  ];
}

/**
 * Landing page for the "pdf to flashcards" search query.
 *
 * Hand-written rather than templated: the extraction behaviour it describes
 * (a real text layer, no OCR) is specific to PDFs and would be wrong copy on
 * the Word or PowerPoint pages.
 */
export function PdfToFlashcardsPage() {
  const t = useT();
  return (
    <div className="mx-auto max-w-4xl px-6 py-20">
      <section className="flex flex-col items-center text-center">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-cyan-500/25 px-4 py-1.5 text-xs font-semibold tracking-wide text-cyan-600 brand-tint dark:text-cyan-400">
          <span className="h-1.5 w-1.5 rounded-full brand-gradient" />
          {t('useCase.pdf.eyebrow')}
        </div>
        <h1 className="mb-5 max-w-2xl font-display text-4xl font-bold tracking-tight text-slate-900 dark:text-white md:text-5xl">
          {t('useCase.pdf.h1')}
        </h1>
        <p className="max-w-xl text-lg leading-relaxed text-slate-500 dark:text-slate-400">
          {t('useCase.pdf.subtitle')}
        </p>
      </section>

      <section className="mt-16 grid grid-cols-1 gap-6 sm:grid-cols-3">
        {steps(t).map((item) => (
          <div key={item.step} className="rounded-2xl border border-slate-100 bg-white/60 p-6 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/60">
            <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-xl text-xs font-bold text-white brand-gradient">
              {item.step}
            </div>
            <h3 className="mb-2 font-display text-sm font-semibold text-slate-800 dark:text-slate-100">{item.title}</h3>
            <p className="text-sm leading-relaxed text-slate-500 dark:text-slate-400">{item.description}</p>
          </div>
        ))}
      </section>

      <section className="mt-14 rounded-2xl border border-slate-200 bg-slate-50/60 p-6 dark:border-slate-800 dark:bg-slate-900/40">
        <h2 className="mb-2 font-display text-sm font-semibold text-slate-800 dark:text-slate-100">
          {t('useCase.pdf.honest.heading')}
        </h2>
        <p className="text-sm leading-relaxed text-slate-500 dark:text-slate-400">{t('useCase.pdf.honest.body')}</p>
      </section>

      <div className="mt-14 flex justify-center">
        <Link to="/demo">
          <BrandButton>{t('useCase.pdf.cta')}</BrandButton>
        </Link>
      </div>
    </div>
  );
}
