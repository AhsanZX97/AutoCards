import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  DEMO_DECK_ID,
  buildDemoCards,
  buildDemoDeck,
  buildDemoHistory,
  buildDemoSettings,
  buildDemoSource,
  computeScore,
  type CardAnswer,
  type MessageKey,
  type SessionSummary,
  type StudySettings,
} from '@autocards/core';
import { BrandButton } from '../../../components/ui';
import { useLocale, useT } from '../../../lib/i18n';
import { cn } from '../../../lib/cn';
import { DeviceFrame, type DemoDevice } from './DeviceFrame';
import { UploadFrame } from './UploadFrame';
import { DeckFrame } from './DeckFrame';
import { SetupFrame } from './SetupFrame';
import { RunnerFrame } from './RunnerFrame';
import { ResultsFrame } from './ResultsFrame';
import { ProgressFrame } from './ProgressFrame';

interface Step {
  id: string;
  /** Shown in the browser chrome, so the walkthrough reads as one journey through the app. */
  path: string;
}

const STEPS: Step[] = [
  { id: 'upload', path: '/app/decks/new' },
  { id: 'deck', path: `/app/decks/${DEMO_DECK_ID}` },
  { id: 'setup', path: `/app/study/${DEMO_DECK_ID}` },
  { id: 'study', path: `/app/study/${DEMO_DECK_ID}/run` },
  { id: 'results', path: `/app/study/${DEMO_DECK_ID}/results` },
  { id: 'progress', path: '/app/stats' },
];

interface Run {
  answers: CardAnswer[];
  durationMs: number;
}

/**
 * The public `/demo` — the whole product in six screens, signed out.
 *
 * These are not screenshots and not a second implementation of the app: the
 * frames render the real UI kit against real `Deck` / `Flashcard` records and
 * hand them to the app's own `autoGrade`, `computeScore`, `computeDeckStats`
 * and `computeOverallStats`. Only the generation step is scripted, because
 * that one costs money — see `UploadFrame`.
 *
 * Nothing is written to storage, so a refresh starts the walkthrough over and
 * a visitor who signs up afterwards doesn't inherit a stray demo deck.
 */
export function DemoPage() {
  const t = useT();
  const locale = useLocale();

  // Rebuilt per locale rather than per render: the frames key on card ids, and
  // a fresh identity each render would remount every card mid-run.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const deck = useMemo(() => buildDemoDeck(t), [locale]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const cards = useMemo(() => buildDemoCards(t), [locale]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const source = useMemo(() => buildDemoSource(t), [locale]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const history = useMemo(() => buildDemoHistory(t), [locale]);

  const [step, setStep] = useState(0);
  const [device, setDevice] = useState<DemoDevice>('desktop');
  const [settings, setSettings] = useState<StudySettings>(() => buildDemoSettings());
  const [run, setRun] = useState<Run | null>(null);
  // Bumped on a replay so the runner starts from a clean queue, position and score.
  const [runKey, setRunKey] = useState(0);

  const compact = device === 'phone';
  const current = STEPS[step]!;

  const cardsById = useMemo(() => new Map(cards.map((card) => [card.id, card])), [cards]);
  const playedSession: SessionSummary | null = useMemo(() => {
    if (!run || run.answers.length === 0) return null;
    const score = computeScore(run.answers, cardsById, settings);
    return {
      id: 'demo_session_live',
      deckId: deck.id,
      deckTitle: deck.title,
      mode: settings.mode,
      answered: score.answered,
      correct: score.correct,
      accuracy: score.accuracy,
      finalScore: score.finalScore,
      xp: score.xp,
      letter: score.letter,
      maxStreak: score.maxStreak,
      durationMs: run.durationMs,
      endedAt: new Date().toISOString(),
    };
  }, [run, cardsById, settings, deck]);

  function goTo(next: number) {
    setStep(Math.max(0, Math.min(STEPS.length - 1, next)));
  }

  function restartRun() {
    setRun(null);
    setRunKey((key) => key + 1);
    goTo(3);
  }

  return (
    <section className="relative z-10 mx-auto flex max-w-6xl flex-col px-6 pb-24 pt-12">
      <div className="mx-auto mb-10 flex max-w-2xl flex-col items-center text-center">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-cyan-500/25 px-4 py-1.5 text-xs font-semibold tracking-wide text-cyan-600 brand-tint dark:text-cyan-400">
          <span className="h-1.5 w-1.5 rounded-full brand-gradient" />
          {t('demo.badge')}
        </div>
        <h1 className="mb-4 font-display text-3xl font-bold tracking-tight text-slate-900 dark:text-white md:text-4xl">
          {t('demo.title')}
        </h1>
        <p className="text-base leading-relaxed text-slate-500 dark:text-slate-400">{t('demo.subtitle')}</p>
      </div>

      <div className="mb-8 flex justify-center">
        <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900">
          {(['desktop', 'phone'] as const).map((option) => (
            <button
              key={option}
              onClick={() => setDevice(option)}
              className={cn(
                'rounded-full px-5 py-2 text-sm font-medium transition-colors',
                device === option
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100',
              )}
            >
              {t(`demo.device.${option}` as MessageKey)}
            </button>
          ))}
        </div>
      </div>

      {/* `items-center` rather than the default stretch: the rail is much
          shorter than the frame beside it, and left hanging from the top it
          reads as unaligned with everything else on the page. */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:gap-8">
        <ol className="flex shrink-0 gap-2 overflow-x-auto scrollbar-thin lg:w-56 lg:flex-col lg:overflow-visible">
          {STEPS.map((entry, index) => {
            const active = index === step;
            return (
              <li key={entry.id} className="shrink-0 lg:shrink">
                <button
                  onClick={() => goTo(index)}
                  aria-current={active ? 'step' : undefined}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition-colors',
                    active
                      ? 'border-brand-600 bg-brand-600 text-white'
                      : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:border-slate-700',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                      active
                        ? 'bg-white/20 text-white'
                        : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500',
                    )}
                  >
                    {index + 1}
                  </span>
                  {t(`demo.step.${entry.id}.label` as MessageKey)}
                </button>
              </li>
            );
          })}
        </ol>

        <div className="min-w-0 flex-1">
          <p className="mb-4 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
            {t(`demo.step.${current.id}.caption` as MessageKey, { count: cards.length })}
          </p>

          <DeviceFrame device={device} path={current.path}>
            {current.id === 'upload' && (
              <UploadFrame source={source} cardCount={cards.length} compact={compact} onDone={() => goTo(1)} />
            )}
            {current.id === 'deck' && (
              <DeckFrame deck={deck} cards={cards} compact={compact} onStudy={() => goTo(2)} />
            )}
            {current.id === 'setup' && (
              <SetupFrame
                deckTitle={deck.title}
                cardCount={cards.length}
                settings={settings}
                onChange={setSettings}
                compact={compact}
                onStart={() => {
                  setRun(null);
                  setRunKey((key) => key + 1);
                  goTo(3);
                }}
              />
            )}
            {current.id === 'study' && (
              <RunnerFrame
                key={runKey}
                cards={cards}
                settings={settings}
                compact={compact}
                onFinish={(answers, durationMs) => {
                  setRun({ answers, durationMs });
                  goTo(4);
                }}
              />
            )}
            {current.id === 'results' && (
              <ResultsFrame
                deckTitle={deck.title}
                cards={cards}
                answers={run?.answers ?? []}
                settings={settings}
                durationMs={run?.durationMs ?? 0}
                compact={compact}
                onRetry={restartRun}
              />
            )}
            {current.id === 'progress' && (
              <ProgressFrame history={history} session={playedSession} compact={compact} />
            )}
          </DeviceFrame>
        </div>

        {/* Balances the rail so the frame is centred on the page rather than
            pushed half a rail's width to the right of the heading above it. */}
        <div aria-hidden className="hidden shrink-0 lg:block lg:w-56" />
      </div>

      <Link to="/sign-up" className="mx-auto mt-14">
        <BrandButton>{t('demo.cta.button')}</BrandButton>
      </Link>

      <Link
        to="/"
        className="mx-auto mt-10 text-sm font-medium text-slate-400 transition-colors hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
      >
        {t('demo.backToHome')}
      </Link>
    </section>
  );
}
