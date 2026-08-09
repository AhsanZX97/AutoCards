import { Link } from 'react-router-dom';
import { BrandButton } from '../../components/ui';

const FEATURES = [
  {
    icon: '⚡',
    title: 'Instant Generation',
    description: 'Upload slides, notes or a chapter and get a full deck in seconds. No formatting needed.',
  },
  {
    icon: '🧠',
    title: 'Adaptive Learning',
    description: 'Our spaced-repetition engine surfaces cards right before you forget them.',
  },
  {
    icon: '📊',
    title: 'Progress Insights',
    description: 'Track retention rates, streaks, and weak spots across every deck you own.',
  },
  {
    icon: '🔗',
    title: 'Share & Collaborate',
    description: 'Publish decks publicly or invite teammates to study the same material together.',
  },
];

const STEPS = [
  {
    step: '01',
    title: 'Upload your material',
    description:
      'Drop in a PDF, a Word document, a slide deck or your notes — several at once, and Auto Cards reads them together.',
  },
  {
    step: '02',
    title: 'AI builds your deck',
    description:
      'Our model extracts key concepts, generates questions, and organises them into a clean deck in seconds.',
  },
  {
    step: '03',
    title: 'Study and improve',
    description:
      'Rate each card and let the spaced-repetition engine schedule reviews so you retain everything long-term.',
  },
];

const PLANS = [
  {
    name: 'Free',
    price: '$0',
    period: 'forever',
    description: 'Perfect for casual learners getting started.',
    features: ['5 decks', '50 cards per deck', 'Basic spaced repetition', 'Mobile app access'],
    cta: 'Get started',
    highlight: false,
  },
  {
    name: 'Pro',
    price: '$9',
    period: 'per month',
    description: 'For students who study seriously.',
    features: [
      'Unlimited decks',
      'Unlimited cards',
      'Advanced analytics',
      'PDF, Word & PowerPoint imports',
      'Priority AI generation',
    ],
    cta: 'Start free trial',
    highlight: true,
  },
  {
    name: 'Team',
    price: '$24',
    period: 'per month',
    description: 'For study groups and classrooms.',
    features: [
      'Everything in Pro',
      'Up to 10 members',
      'Shared decks & folders',
      'Admin dashboard',
      'Dedicated support',
    ],
    cta: 'Contact us',
    highlight: false,
  },
];

const REVIEW_GRADES = ['Again', 'Hard', 'Good', 'Easy'];
const SUGGESTED_GRADE = 'Good';

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
  return (
    <>
      {/* Hero */}
      <section className="relative z-10 flex flex-col items-center px-6 pb-24 pt-20 text-center">
        <div className="mb-10 inline-flex items-center gap-2 rounded-full border border-cyan-500/25 px-4 py-1.5 text-xs font-semibold tracking-wide text-cyan-600 brand-tint dark:text-cyan-400">
          <span className="h-1.5 w-1.5 rounded-full brand-gradient" />
          AI-powered study — now in beta
        </div>

        <h1 className="mb-6 max-w-3xl font-display text-5xl font-extrabold leading-[1.05] tracking-tight md:text-7xl">
          <span className="brand-text-hero">Auto</span>
          <span className="text-slate-900 dark:text-white"> Cards</span>
        </h1>

        <p className="mb-10 max-w-xl text-xl font-medium leading-relaxed text-slate-500 dark:text-slate-400 md:text-2xl">
          AI flashcards for you
        </p>

        <div className="flex flex-col items-center gap-3 sm:flex-row">
          <Link to="/sign-up">
            <BrandButton>
              Create your first deck
              <ArrowRightIcon />
            </BrandButton>
          </Link>
          <a href="#how-it-works">
            <BrandButton variant="secondary">
              <QuestionIcon />
              See how it works
            </BrandButton>
          </a>
        </div>

        <p className="mt-8 text-xs font-medium tracking-wide text-slate-400 dark:text-slate-500">
          Trusted by <span className="font-semibold text-slate-600 dark:text-slate-300">2,400+</span> students · No
          credit card required
        </p>
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
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Biology 101</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">24 cards · Generated from your notes</p>
                </div>
              </div>
              <span className="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-600 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400">
                87% retention
              </span>
            </div>

            <div className="mb-4 flex min-h-[120px] flex-col items-center justify-center rounded-xl border border-cyan-500/15 p-6 text-center brand-tint">
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                Front
              </p>
              <p className="font-display text-lg font-semibold text-slate-800 dark:text-slate-100">
                What is the powerhouse of the cell?
              </p>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                {REVIEW_GRADES.map((label) => {
                  const suggested = label === SUGGESTED_GRADE;
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
              <p className="text-xs text-slate-400 dark:text-slate-500">Card 7 of 24</p>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="relative z-10 mx-auto max-w-6xl px-6 pb-28">
        <div className="mb-14 text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-cyan-500">Why Auto Cards</p>
          <h2 className="font-display text-3xl font-bold tracking-tight text-slate-900 dark:text-white md:text-4xl">
            Study smarter, not harder
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((feature) => (
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
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-cyan-500">How it works</p>
          <h2 className="font-display text-3xl font-bold tracking-tight text-slate-900 dark:text-white md:text-4xl">
            Three steps to mastery
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
          {STEPS.map((item) => (
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
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-cyan-500">Pricing</p>
          <h2 className="font-display text-3xl font-bold tracking-tight text-slate-900 dark:text-white md:text-4xl">
            Simple, transparent pricing
          </h2>
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Start free. Upgrade when you need more.</p>
        </div>

        <div className="grid grid-cols-1 items-stretch gap-6 md:grid-cols-3">
          {PLANS.map((plan) => (
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
                  Most popular
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
    </>
  );
}
