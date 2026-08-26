import { useMemo } from 'react';
import {
  computeScore,
  formatDuration,
  formatSeconds,
  type CardAnswer,
  type Flashcard,
  type StudySettings,
} from '@autocards/core';
import { Button, Card, CardBody } from '../../../components/ui';
import { useT } from '../../../lib/i18n';
import { cn } from '../../../lib/cn';

const LETTER_COLORS: Record<string, string> = {
  S: 'text-violet-500',
  A: 'text-emerald-500',
  B: 'text-sky-500',
  C: 'text-amber-500',
  D: 'text-orange-500',
  F: 'text-rose-500',
};

/**
 * The run just played, scored by `computeScore`.
 *
 * A visitor who clicked straight past the cards has no answers to score, so
 * the screen falls back to a sample run and says as much — an empty results
 * screen would show nothing of what the real one does.
 */
export function ResultsFrame({
  deckTitle,
  cards,
  answers,
  settings,
  durationMs,
  compact,
  onRetry,
}: {
  deckTitle: string;
  cards: Flashcard[];
  answers: CardAnswer[];
  settings: StudySettings;
  durationMs: number;
  compact: boolean;
  onRetry: () => void;
}) {
  const t = useT();
  const isSample = answers.length === 0;
  const scoredAnswers = useMemo(() => (isSample ? sampleAnswers(cards) : answers), [isSample, cards, answers]);
  const cardsById = useMemo(() => new Map(cards.map((card) => [card.id, card])), [cards]);
  const score = useMemo(
    () => computeScore(scoredAnswers, cardsById, settings),
    [scoredAnswers, cardsById, settings],
  );
  const elapsed = isSample ? scoredAnswers.reduce((total, answer) => total + answer.timeMs, 0) : durationMs;

  return (
    <div className={cn('mx-auto flex max-w-2xl flex-col justify-center', compact ? 'p-4 pt-12' : 'p-8')}>
      <div className="text-center">
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{deckTitle}</p>
        <h1 className={cn('font-display mt-2 text-7xl font-extrabold', LETTER_COLORS[score.letter] ?? 'text-slate-500')}>
          {score.letter}
        </h1>
        <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">
          {t('results.pointsXp', { points: score.finalScore.toLocaleString(), xp: score.xp })}
        </p>
        {isSample && <p className="mt-2 text-xs text-slate-400">{t('demo.results.sample')}</p>}
      </div>

      <div className={cn('mt-8 grid gap-4', compact ? 'grid-cols-2' : 'grid-cols-4')}>
        <Stat label={t('results.accuracy')} value={`${Math.round(score.accuracy * 100)}%`} />
        <Stat label={t('results.correct')} value={`${score.correct}/${score.answered}`} />
        <Stat label={t('results.bestStreak')} value={score.maxStreak} />
        <Stat label={t('results.time')} value={formatDuration(elapsed)} />
      </div>

      <Card className="mt-8">
        <CardBody className="space-y-2">
          <h3 className="mb-3 font-semibold text-slate-900 dark:text-white">{t('results.scoreBreakdown')}</h3>
          <BreakdownRow label={t('results.basePoints')} value={score.basePoints} />
          {score.difficultyBonus > 0 && <BreakdownRow label={t('results.difficultyBonus')} value={score.difficultyBonus} positive />}
          {score.speedBonus > 0 && <BreakdownRow label={t('results.speedBonus')} value={score.speedBonus} positive />}
          {score.streakBonus > 0 && <BreakdownRow label={t('results.streakBonus')} value={score.streakBonus} positive />}
          {score.hintPenalty > 0 && <BreakdownRow label={t('results.hintPenalty')} value={-score.hintPenalty} />}
          {score.timeoutPenalty > 0 && <BreakdownRow label={t('results.timeoutPenalty')} value={-score.timeoutPenalty} />}
          <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-sm font-semibold text-slate-900 dark:border-slate-800 dark:text-white">
            <span>{t('results.finalScore')}</span>
            <span>{score.finalScore}</span>
          </div>
          <p className="pt-1 text-xs text-slate-400">
            {t('results.averageAnswerTime', { time: formatSeconds(score.averageTimeMs) })}
          </p>
        </CardBody>
      </Card>

      <Button variant="outline" className="mt-8 justify-center" onClick={onRetry}>
        {t('demo.results.retry')}
      </Button>
    </div>
  );
}

/**
 * A believable run for a visitor who skipped the cards. Fixed rather than
 * random so the results screen and the progress screen behind it agree with
 * each other on every load.
 */
function sampleAnswers(cards: Flashcard[]): CardAnswer[] {
  const missed = new Set([2, 5]);
  return cards.map((card, index) => ({
    cardId: card.id,
    grade: missed.has(index) ? ('again' as const) : ('good' as const),
    correct: !missed.has(index),
    timeMs: 3_200 + index * 900,
    usedHint: false,
    timedOut: false,
    answeredAt: new Date().toISOString(),
  }));
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardBody className="p-4 text-center">
        <p className="text-xl font-bold text-slate-900 dark:text-white">{value}</p>
        <p className="text-xs text-slate-400">{label}</p>
      </CardBody>
    </Card>
  );
}

function BreakdownRow({ label, value, positive }: { label: string; value: number; positive?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <span className={positive ? 'font-medium text-emerald-600 dark:text-emerald-400' : 'font-medium text-slate-700 dark:text-slate-300'}>
        {value > 0 ? '+' : ''}
        {value}
      </span>
    </div>
  );
}
