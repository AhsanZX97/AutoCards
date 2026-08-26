import { useEffect, useMemo, useRef, useState } from 'react';
import {
  SURVIVAL_LIVES,
  autoGrade,
  computeScore,
  getAnswerText,
  getPromptText,
  type CardAnswer,
  type Flashcard,
  type Grade,
  type StudySettings,
} from '@autocards/core';
import { Button, Progress } from '../../../components/ui';
import { useT } from '../../../lib/i18n';
import { cn } from '../../../lib/cn';
import { CardFace } from '../../study/CardFace';

interface Revealed {
  correct: boolean;
  grade: Grade;
  nearMiss?: boolean;
}

/**
 * A real run over the demo deck.
 *
 * Grading is `autoGrade` and the running score is `computeScore` — the same
 * calls the study runner makes — so what the visitor sees here is what they
 * would get signed in. What this deliberately does not do is start a
 * `StudySession`: nothing is written to storage, so a visitor who signs up
 * afterwards doesn't inherit a stray deck and a stray session in their browser.
 */
export function RunnerFrame({
  cards,
  settings,
  compact,
  onFinish,
}: {
  cards: Flashcard[];
  settings: StudySettings;
  compact: boolean;
  onFinish: (answers: CardAnswer[], durationMs: number) => void;
}) {
  const t = useT();

  const [queue, setQueue] = useState<Flashcard[]>(cards);
  const [position, setPosition] = useState(0);
  const [answers, setAnswers] = useState<CardAnswer[]>([]);
  const [lives, setLives] = useState(SURVIVAL_LIVES);

  const [flipped, setFlipped] = useState(false);
  const [hintRevealed, setHintRevealed] = useState(false);
  const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [revealed, setRevealed] = useState<Revealed | null>(null);
  const [remaining, setRemaining] = useState(settings.timer.perCardSeconds);

  const startedAt = useRef(Date.now());
  const cardShownAt = useRef(Date.now());

  const card = queue[position];
  const cardsById = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const score = useMemo(() => computeScore(answers, cardsById, settings), [answers, cardsById, settings]);
  // Exam mode holds every verdict back until the end, so the runner shows no
  // per-card feedback and moves straight on.
  const silentGrading = settings.mode === 'exam';
  const isAutoGraded = card ? card.type !== 'basic' : false;

  function resetCardState() {
    setFlipped(false);
    setHintRevealed(false);
    setSelectedChoiceId(null);
    setTyped('');
    setRevealed(null);
    setRemaining(settings.timer.perCardSeconds);
    cardShownAt.current = Date.now();
  }

  function finish(finalAnswers: CardAnswer[]) {
    onFinish(finalAnswers, Date.now() - startedAt.current);
  }

  function submit(grade: Grade, correct: boolean, timedOut = false, response?: string) {
    if (!card) return;
    const answer: CardAnswer = {
      cardId: card.id,
      grade,
      correct,
      timeMs: Date.now() - cardShownAt.current,
      usedHint: hintRevealed,
      timedOut,
      response,
      answeredAt: new Date().toISOString(),
    };
    const nextAnswers = [...answers, answer];
    setAnswers(nextAnswers);

    // Survival ends the run early; cram keeps a missed card in play until it
    // is answered right. Both are the modes doing what the picker promised.
    const livesLeft = settings.mode === 'survival' && !correct ? lives - 1 : lives;
    if (settings.mode === 'survival') setLives(livesLeft);
    if (settings.mode === 'survival' && livesLeft <= 0) {
      finish(nextAnswers);
      return;
    }

    let nextQueue = queue;
    if (settings.mode === 'cram' && !correct) {
      nextQueue = [...queue, card];
      setQueue(nextQueue);
    }

    if (position + 1 >= nextQueue.length) {
      finish(nextAnswers);
      return;
    }
    setPosition(position + 1);
    resetCardState();
  }

  // The per-card countdown. Running out is an answer like any other — recorded
  // as a timeout, which is what the score breakdown penalises.
  useEffect(() => {
    if (!settings.timer.enabled || revealed || !card) return;
    if (remaining <= 0) {
      submit('again', false, true);
      return;
    }
    const timer = setTimeout(() => setRemaining((seconds) => seconds - 1), 1_000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining, revealed, card, settings.timer.enabled]);

  if (!card) return null;

  function gradeResponse(response: string) {
    if (revealed || !response.trim()) return;
    const result = autoGrade(card!, response);
    if (silentGrading) {
      submit(result.grade, result.correct, false, response);
      return;
    }
    setRevealed({ correct: result.correct, grade: result.grade, nearMiss: result.nearMiss });
  }

  function selfGrade(grade: Grade, correct: boolean) {
    submit(grade, correct);
  }

  return (
    <div className="flex min-h-full flex-col bg-slate-950">
      <div className={cn('flex items-center gap-4 py-4', compact ? 'px-4 pt-10' : 'px-8')}>
        <div className="flex-1">
          <Progress value={position} max={queue.length} className="bg-slate-800" barClassName="bg-brand-500" />
        </div>
        <span className="shrink-0 text-sm font-medium text-slate-400">
          {position + 1} / {queue.length}
        </span>
        {settings.mode === 'survival' && (
          <span className="shrink-0 text-sm">
            {'❤️'.repeat(Math.max(0, lives))}
            {'🖤'.repeat(Math.max(0, SURVIVAL_LIVES - lives))}
          </span>
        )}
      </div>

      {settings.timer.enabled && (
        <div className={compact ? 'px-4' : 'px-8'}>
          <Progress
            value={remaining}
            max={settings.timer.perCardSeconds}
            className="h-1 bg-slate-800"
            barClassName={remaining <= 5 ? 'bg-rose-500' : 'bg-sky-500'}
          />
        </div>
      )}

      <div className={cn('flex items-center justify-between gap-4 py-3 text-xs', compact ? 'px-4' : 'px-8')}>
        <span className="text-slate-400">
          {t('demo.runner.score')} <span className="font-semibold text-white">{score.finalScore}</span>
        </span>
        <span className="text-slate-400">
          {t('demo.runner.streak')} <span className="font-semibold text-white">🔥 {score.maxStreak}</span>
        </span>
      </div>

      <div className={cn('flex flex-1 flex-col items-center justify-center py-6', compact ? 'px-4' : 'px-8')}>
        <div className="w-full max-w-xl">
          {!isAutoGraded ? (
            <>
              <CardFace
                card={card}
                flipped={flipped}
                promptText={getPromptText(card)}
                answerText={getAnswerText(card)}
                onFlip={() => setFlipped(true)}
              />
              {!flipped ? (
                <div className="mt-6 flex flex-col items-center gap-3">
                  {card.hint && !hintRevealed && (
                    <button
                      onClick={() => setHintRevealed(true)}
                      className="text-sm font-medium text-slate-400 hover:text-slate-200"
                    >
                      {t('runner.showHint')}
                    </button>
                  )}
                  {hintRevealed && card.hint && (
                    <p className="rounded-lg bg-slate-800 px-4 py-2 text-sm text-slate-300">{card.hint}</p>
                  )}
                  <Button size="lg" className="w-full max-w-xs justify-center" onClick={() => setFlipped(true)}>
                    {t('runner.showAnswer')}
                  </Button>
                </div>
              ) : (
                <div className="mt-6">
                  {card.explanation && (
                    <p className="mb-4 rounded-lg bg-slate-800 px-4 py-3 text-center text-sm text-slate-300">
                      {card.explanation}
                    </p>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => selfGrade('again', false)}
                      className="rounded-xl bg-rose-600 py-3.5 font-semibold text-white transition-colors hover:bg-rose-500"
                    >
                      {t('runner.incorrect')}
                    </button>
                    <button
                      onClick={() => selfGrade('good', true)}
                      className="rounded-xl bg-emerald-600 py-3.5 font-semibold text-white transition-colors hover:bg-emerald-500"
                    >
                      {t('runner.correct')}
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center shadow-glow">
              <p className="text-lg font-semibold text-white">{card.front}</p>

              {card.hint && !hintRevealed && !revealed && (
                <button
                  onClick={() => setHintRevealed(true)}
                  className="mt-3 text-sm font-medium text-slate-400 hover:text-slate-200"
                >
                  {t('runner.showHint')}
                </button>
              )}
              {card.hint && hintRevealed && <p className="mt-3 text-sm text-slate-400">{card.hint}</p>}

              {(card.type === 'multiple-choice' || card.type === 'true-false') && (
                <div className="mt-6 space-y-2 text-left">
                  {(card.choices ?? []).map((choice) => {
                    const isSelected = selectedChoiceId === choice.id;
                    const showState = revealed !== null;
                    return (
                      <button
                        key={choice.id}
                        disabled={showState}
                        onClick={() => {
                          setSelectedChoiceId(choice.id);
                          gradeResponse(choice.id);
                        }}
                        className={cn(
                          'w-full rounded-xl border px-4 py-3 text-sm font-medium transition-colors',
                          !showState && 'border-slate-700 text-slate-200 hover:border-brand-500 hover:bg-slate-800',
                          showState && choice.correct && 'border-emerald-500 bg-emerald-500/10 text-emerald-400',
                          showState && isSelected && !choice.correct && 'border-rose-500 bg-rose-500/10 text-rose-400',
                          showState && !isSelected && !choice.correct && 'border-slate-800 text-slate-500',
                        )}
                      >
                        {choice.text}
                      </button>
                    );
                  })}
                </div>
              )}

              {card.type === 'type-in' && (
                <div className="mt-6">
                  <input
                    disabled={revealed !== null}
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && gradeResponse(typed)}
                    placeholder={t('runner.typePlaceholder')}
                    className={cn(
                      'w-full rounded-xl border bg-slate-800 px-4 py-3 text-center text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500',
                      revealed === null ? 'border-slate-700' : revealed.correct ? 'border-emerald-500' : 'border-rose-500',
                    )}
                  />
                  {revealed && !revealed.correct && (
                    <p className="mt-2 text-sm text-slate-400">
                      {t('runner.accepted', { answers: (card.acceptedAnswers ?? [card.back]).join(', ') })}
                    </p>
                  )}
                  {revealed === null && (
                    <Button className="mt-4 w-full justify-center" onClick={() => gradeResponse(typed)} disabled={!typed.trim()}>
                      {t('runner.submit')}
                    </Button>
                  )}
                </div>
              )}

              {revealed && (
                <div className="mt-6">
                  <p className={cn('mb-3 text-sm font-semibold', revealed.correct ? 'text-emerald-400' : 'text-rose-400')}>
                    {revealed.correct
                      ? revealed.nearMiss
                        ? t('demo.nearMiss')
                        : t('runner.correctBang')
                      : t('runner.notQuite')}
                  </p>
                  {card.explanation && <p className="mb-4 text-sm text-slate-400">{card.explanation}</p>}
                  <Button
                    size="lg"
                    className="w-full justify-center"
                    onClick={() =>
                      submit(
                        revealed.grade,
                        revealed.correct,
                        false,
                        card.type === 'type-in' ? typed : selectedChoiceId ?? undefined,
                      )
                    }
                  >
                    {position + 1 >= queue.length ? t('demo.runner.finish') : t('runner.nextCard')}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
