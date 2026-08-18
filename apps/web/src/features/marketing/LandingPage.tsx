import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { PLAN_LIMITS, type Plan, type Translator } from '@autocards/core';
import { BrandButton } from '../../components/ui';
import { useT } from '../../lib/i18n';

function features(t: Translator) {
  return [
    { icon: '⚡', title: t('landing.features.instant.title'), description: t('landing.features.instant.description') },
    { icon: '🧠', title: t('landing.features.adaptive.title'), description: t('landing.features.adaptive.description') },
    { icon: '📊', title: t('landing.features.insights.title'), description: t('landing.features.insights.description') },
    { icon: '🔗', title: t('landing.features.share.title'), description: t('landing.features.share.description') },
  ];
}

function steps(t: Translator) {
  return [
    { step: '01', title: t('landing.steps.upload.title'), description: t('landing.steps.upload.description') },
    { step: '02', title: t('landing.steps.build.title'), description: t('landing.steps.build.description') },
    { step: '03', title: t('landing.steps.study.title'), description: t('landing.steps.study.description') },
  ];
}

function formatLimit(t: Translator, value: number): string {
  return value === Number.POSITIVE_INFINITY ? t('landing.pricing.unlimited') : value.toLocaleString();
}

/**
 * The numbers on the pricing table, read from the limits the app actually
 * enforces.
 *
 * Written by hand until recently, and wrong — it advertised five decks and
 * fifty cards each while the code allowed three decks and five generations.
 * That was survivable while nothing was enforced. Now that the server turns
 * people away at these exact numbers, an inflated one here is a promise the
 * product visibly breaks, so there is only one place to change them.
 */
function planFeatures(t: Translator, plan: Plan): string[] {
  const limits = PLAN_LIMITS[plan];
  return [
    t('landing.pricing.generationsPerMonth', { count: formatLimit(t, limits.monthlyUploads) }),
    t('landing.pricing.decksCount', { count: formatLimit(t, limits.maxDecks) }),
    t('landing.pricing.pagesPerDocument', { count: formatLimit(t, limits.maxPagesPerPdf) }),
  ];
}

/**
 * The lifetime tier's lines, minus anything Pro already advertises.
 *
 * "Everything in Pro" covers those, and a tier that repeats them reads as
 * padding rather than as an upgrade. Still derived from `PLAN_LIMITS` for the
 * reason above — the numbers are not written twice.
 */
function lifetimeFeatures(t: Translator): string[] {
  const pro = new Set(planFeatures(t, 'pro'));
  return planFeatures(t, 'lifetime').filter((feature) => !pro.has(feature));
}

function plans(t: Translator) {
  return [
    {
      name: 'Free',
      price: '$0',
      period: t('landing.pricing.forever'),
      description: t('landing.pricing.free.description'),
      features: [...planFeatures(t, 'free'), t('landing.pricing.mobileAppAccess')],
      cta: t('landing.pricing.getStarted'),
      highlight: false,
    },
    {
      name: 'Pro',
      price: '$4',
      period: t('landing.pricing.perMonth'),
      description: t('landing.pricing.pro.description'),
      features: [...planFeatures(t, 'pro'), t('landing.pricing.advancedAnalytics'), t('landing.pricing.fileImports')],
      cta: t('landing.pricing.getPro'),
      highlight: true,
    },
    {
      name: 'Lifetime',
      price: '$39',
      period: t('landing.pricing.oneTime'),
      description: t('landing.pricing.lifetime.description'),
      features: [t('landing.pricing.everythingInPro'), ...lifetimeFeatures(t), t('landing.pricing.everyFutureFeature')],
      cta: t('landing.pricing.buyLifetime'),
      highlight: false,
    },
  ];
}

function reviewGrades(t: Translator) {
  return [
    t('landing.preview.grade.again'),
    t('landing.preview.grade.hard'),
    t('landing.preview.grade.good'),
    t('landing.preview.grade.easy'),
  ];
}

function ArrowRightIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M3 7h8M8 4l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function QuestionIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5.5 5.2a1.5 1.5 0 0 1 3 .6c0 1-1.5 1.5-1.5 2.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="7" cy="10" r=".5" fill="currentColor" />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.05 12.04c-.03-2.6 2.12-3.85 2.22-3.91-1.21-1.77-3.09-2.01-3.76-2.04-1.6-.16-3.12.94-3.93.94-.81 0-2.06-.92-3.39-.9-1.74.03-3.35 1.01-4.25 2.57-1.81 3.14-.46 7.79 1.3 10.34.86 1.25 1.89 2.65 3.24 2.6 1.3-.05 1.79-.84 3.36-.84 1.57 0 2.01.84 3.38.81 1.4-.02 2.28-1.27 3.13-2.53.99-1.45 1.4-2.85 1.42-2.92-.03-.01-2.72-1.04-2.75-4.12M14.6 4.42c.71-.87 1.19-2.07 1.06-3.27-1.02.04-2.26.68-3 1.55-.66.76-1.24 1.99-1.09 3.16 1.14.09 2.31-.58 3.03-1.44" />
    </svg>
  );
}

function GooglePlayIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M3.06 2.28a1.5 1.5 0 0 0-.56 1.17v17.1c0 .46.21.88.56 1.17l9.02-9.72L3.06 2.28Zm10.1 8.98 2.6-2.8L5.2 2.3c-.3-.17-.62-.22-.9-.16l8.86 9.12Zm0 1.48-8.86 9.12c.28.06.6.01.9-.16l10.56-6.16-2.6-2.8Zm3.72 1.98 2.8-1.63c.9-.52.9-1.7 0-2.22l-2.8-1.63-2.87 2.74 2.87 2.74Z" />
    </svg>
  );
}

/**
 * A store badge for an app that has not shipped yet.
 *
 * Rendered flat and unclickable on purpose: the mobile apps are not in either
 * store, so a live-looking badge would send people to a dead end. It stays on
 * the page because "it's coming to phones" is worth saying, and a greyed badge
 * says it faster than a sentence.
 */
function StoreBadge({ icon, store, label }: { icon: ReactNode; store: string; label: string }) {
  return (
    <div
      aria-disabled="true"
      className="flex cursor-not-allowed select-none items-center gap-3 rounded-xl border border-slate-200 bg-slate-100/70 px-4 py-2.5 text-slate-400 opacity-70 grayscale dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-500"
    >
      {icon}
      <span className="text-left leading-tight">
        <span className="block text-[10px] font-medium uppercase tracking-wide">{label}</span>
        <span className="block font-display text-sm font-semibold text-slate-500 dark:text-slate-400">{store}</span>
      </span>
    </div>
  );
}

function CheckIcon({ highlight }: { highlight: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0" aria-hidden="true">
      <circle cx="7" cy="7" r="7" fill={highlight ? 'rgb(6 182 212 / 0.15)' : 'rgb(100 116 139 / 0.1)'} />
      <path
        d="M4 7l2 2 4-4"
        stroke={highlight ? 'rgb(8 145 178)' : 'rgb(100 116 139)'}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function LandingPage() {
  const t = useT();
  return (
    <>
      {/* Hero */}
      <section className="relative z-10 flex flex-col items-center px-6 pb-24 pt-20 text-center">
        <div className="mb-10 inline-flex items-center gap-2 rounded-full border border-cyan-500/25 px-4 py-1.5 text-xs font-semibold tracking-wide text-cyan-600 brand-tint dark:text-cyan-400">
          <span className="h-1.5 w-1.5 rounded-full brand-gradient" />
          {t('landing.betaBadge')}
        </div>

        <h1 className="mb-6 max-w-3xl font-display text-5xl font-extrabold leading-[1.05] tracking-tight md:text-7xl">
          <span className="brand-text-hero">Auto</span>
          <span className="text-slate-900 dark:text-white"> Cards</span>
        </h1>

        <p className="mb-10 max-w-xl text-xl font-medium leading-relaxed text-slate-500 dark:text-slate-400 md:text-2xl">
          {t('landing.tagline')}
        </p>

        <div className="flex flex-col items-center gap-3 sm:flex-row">
          <Link to="/sign-up">
            <BrandButton>
              {t('landing.createFirstDeck')}
              <ArrowRightIcon />
            </BrandButton>
          </Link>
          <a href="#how-it-works">
            <BrandButton variant="secondary">
              <QuestionIcon />
              {t('landing.seeHowItWorks')}
            </BrandButton>
          </a>
        </div>

        <p className="mt-8 text-xs font-medium tracking-wide text-slate-400 dark:text-slate-500">
          {t('landing.trustedBy', { count: (2_400).toLocaleString(t.locale) })}
        </p>

        {/*
          The store badges belong here, right under the hero CTAs. They sit at
          the foot of the page instead while the apps are unreleased — a pair of
          dead badges is a weak thing to put in the first screenful. Move them
          back once the apps are actually live in the stores.
        */}
      </section>

      {/* Deck preview */}
      <section className="relative z-10 flex justify-center px-6 pb-24">
        <div className="w-full max-w-2xl">
          <div className="rounded-2xl border border-slate-200/80 bg-white/70 p-8 shadow-xl shadow-slate-200/60 backdrop-blur-md dark:border-slate-800/80 dark:bg-slate-900/70 dark:shadow-slate-950/60">
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg brand-gradient">
                  <span className="text-xs font-bold text-white">AC</span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{t('landing.preview.deckName')}</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">{t('landing.preview.deckMeta')}</p>
                </div>
              </div>
              <span className="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-600 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400">
                {t('landing.preview.retention', { percent: 87 })}
              </span>
            </div>

            <div className="mb-4 flex min-h-[120px] flex-col items-center justify-center rounded-xl border border-cyan-500/15 p-6 text-center brand-tint">
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                {t('landing.preview.front')}
              </p>
              <p className="font-display text-lg font-semibold text-slate-800 dark:text-slate-100">
                {t('landing.preview.question')}
              </p>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                {reviewGrades(t).map((label, index) => {
                  const suggested = index === 2; // "Good"
                  return (
                    <button
                      key={label}
                      type="button"
                      className={
                        suggested
                          ? 'rounded-lg border border-cyan-500/40 px-3 py-1.5 text-xs font-medium text-cyan-600 transition-all brand-tint hover:shadow-sm dark:text-cyan-400'
                          : 'rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-500 transition-all hover:shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400'
                      }
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-slate-400 dark:text-slate-500">{t('landing.preview.cardOf', { current: 7, total: 24 })}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="relative z-10 mx-auto max-w-6xl px-6 pb-28">
        <div className="mb-14 text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-cyan-500">{t('landing.features.eyebrow')}</p>
          <h2 className="font-display text-3xl font-bold tracking-tight text-slate-900 dark:text-white md:text-4xl">
            {t('landing.features.title')}
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {features(t).map((feature) => (
            <div
              key={feature.title}
              className="rounded-2xl border border-slate-100 bg-white/60 p-6 backdrop-blur-sm transition-all duration-300 hover:border-cyan-200/70 hover:shadow-lg hover:shadow-cyan-100/40 dark:border-slate-800 dark:bg-slate-900/60 dark:hover:border-cyan-500/30 dark:hover:shadow-cyan-950/40"
            >
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl text-lg brand-tint">
                {feature.icon}
              </div>
              <h3 className="mb-2 font-display text-sm font-semibold text-slate-800 dark:text-slate-100">
                {feature.title}
              </h3>
              <p className="text-sm leading-relaxed text-slate-500 dark:text-slate-400">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="relative z-10 mx-auto max-w-5xl px-6 pb-28">
        <div className="mb-14 text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-cyan-500">{t('landing.steps.eyebrow')}</p>
          <h2 className="font-display text-3xl font-bold tracking-tight text-slate-900 dark:text-white md:text-4xl">
            {t('landing.steps.title')}
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
          {steps(t).map((item) => (
            <div key={item.step} className="flex flex-col gap-4">
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xs font-bold text-white brand-gradient">
                  {item.step}
                </div>
                <div className="hidden h-px flex-1 bg-gradient-to-r from-cyan-200 to-transparent dark:from-cyan-500/30 md:block" />
              </div>
              <div>
                <h3 className="mb-2 font-display text-base font-semibold text-slate-800 dark:text-slate-100">
                  {item.title}
                </h3>
                <p className="text-sm leading-relaxed text-slate-500 dark:text-slate-400">{item.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="relative z-10 mx-auto max-w-5xl px-6 pb-28">
        <div className="mb-14 text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-cyan-500">{t('landing.pricing.eyebrow')}</p>
          <h2 className="font-display text-3xl font-bold tracking-tight text-slate-900 dark:text-white md:text-4xl">
            {t('landing.pricing.title')}
          </h2>
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">{t('landing.pricing.subtitle')}</p>
        </div>

        <div className="grid grid-cols-1 items-stretch gap-6 md:grid-cols-3">
          {plans(t).map((plan) => (
            <div
              key={plan.name}
              className={
                plan.highlight
                  ? 'relative flex scale-[1.02] flex-col rounded-2xl border border-cyan-500/35 p-7 shadow-2xl shadow-cyan-200/50 transition-all brand-tint dark:shadow-cyan-950/40'
                  : 'relative flex flex-col rounded-2xl border border-slate-100 bg-white/60 p-7 backdrop-blur-sm transition-all hover:border-slate-200 hover:shadow-lg dark:border-slate-800 dark:bg-slate-900/60 dark:hover:border-slate-700'
              }
            >
              {plan.highlight && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full px-4 py-1 text-xs font-bold text-white brand-gradient">
                  {t('landing.pricing.mostPopular')}
                </div>
              )}
              <div className="mb-6">
                <p className="mb-2 font-display text-sm font-semibold text-slate-700 dark:text-slate-200">
                  {plan.name}
                </p>
                <div className="mb-1 flex items-end gap-1.5">
                  <span className="font-display text-4xl font-extrabold text-slate-900 dark:text-white">
                    {plan.price}
                  </span>
                  <span className="mb-1.5 text-sm text-slate-400 dark:text-slate-500">{plan.period}</span>
                </div>
                <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">{plan.description}</p>
              </div>
              <ul className="mb-8 flex flex-1 flex-col gap-2.5">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2.5 text-sm text-slate-600 dark:text-slate-300">
                    <CheckIcon highlight={plan.highlight} />
                    {feature}
                  </li>
                ))}
              </ul>
              <Link to="/sign-up" className="block">
                <BrandButton shape="block" variant={plan.highlight ? 'primary' : 'secondary'}>
                  {plan.cta}
                </BrandButton>
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* Mobile apps — temporarily parked here, see the note in the hero. */}
      <section className="relative z-10 mx-auto max-w-5xl px-6 pb-28 text-center">
        <p className="mb-5 text-sm text-slate-500 dark:text-slate-400">{t('landing.mobile.comingSoon')}</p>
        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
          <StoreBadge icon={<AppleIcon />} store={t('landing.mobile.appStore')} label={t('landing.mobile.badgeLabel')} />
          <StoreBadge icon={<GooglePlayIcon />} store={t('landing.mobile.googlePlay')} label={t('landing.mobile.badgeLabel')} />
        </div>
      </section>
    </>
  );
}
