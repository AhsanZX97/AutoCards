import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import {
  SURVIVAL_LIVES,
  autoGrade,
  currentCardId as getCurrentCardId,
  getAnswerText,
  getPromptText,
  type Flashcard,
  type Grade,
} from '@autocards/core';
import { useApp } from '../../lib/appContext';
import { useT } from '../../lib/i18n';
import type { Translator } from '@autocards/core';
import { Button, Progress } from '../../components/ui';
import { cn } from '../../lib/cn';
import { EMPTY_ARRAY } from '../../lib/empty';
import { CardFace } from './CardFace';

const GRADE_STYLES: Record<Grade, string> = {
  again: 'bg-rose-600 hover:bg-rose-500',
  hard: 'bg-amber-500 hover:bg-amber-400',
  good: 'bg-emerald-600 hover:bg-emerald-500',
  easy: 'bg-sky-600 hover:bg-sky-500',
};

export function StudyRunnerPage() {
  const { deckId } = useParams<{ deckId: string }>();
  const navigate = useNavigate();
  const app = useApp();
  const t = useT();

  const session = app.studyStore((s) => s.activeSession);
  const answer = app.studyStore((s) => s.answer);
  const pauseAndAbandon = app.studyStore((s) => s.pauseAndAbandon);
  const cards = app.deckStore((s) => (deckId ? s.cardsByDeck[deckId] ?? EMPTY_ARRAY : EMPTY_ARRAY));

  const cardsById = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const currentId = session ? getCurrentCardId(session) : undefined;
  const currentCard = currentId ? cardsById.get(currentId) : undefined;

  const [flipped, setFlipped] = useState(false);
  const [hintRevealed, setHintRevealed] = useState(false);
  const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null);
  const [typedResponse, setTypedResponse] = useState('');
  const [revealed, setRevealed] = useState<{ correct: boolean; grade: Grade } | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);

  const startedAtRef = useRef(Date.now());
  // How long the card actually took to answer, frozen the moment the answer is
  // locked in. Without this the clock would keep running while the learner
  // reads the explanation, and that reading time would be scored as thinking
  // time — enough on its own to wipe out the speed bonus on every card.
  const answerTimeRef = useRef<number | null>(null);

  // Keyed on the queue slot, not the card id. Cram re-queues a missed card to
  // the end of the queue, so missing the *last* card puts the same id in the
  // very next slot — keying on the id would skip this reset and leave the card
  // stuck showing the previous answer.
  useEffect(() => {
    startedAtRef.current = Date.now();
    answerTimeRef.current = null;
    setFlipped(false);
    setHintRevealed(false);
    setSelectedChoiceId(null);
    setTypedResponse('');
    setRevealed(null);
    setRemaining(session?.settings.timer.enabled ? session.settings.timer.perCardSeconds : null);
  }, [session?.position]); // eslint-disable-line react-hooks/exhaustive-deps

  // The countdown is for producing an answer, so it stops as soon as one
  // exists: `revealed` for auto-graded cards, `flipped` for self-graded ones.
  // Self-graded cards never set `revealed`, so without the `flipped` check the
  // clock would run on while the learner picks a grade and then auto-submit
  // "again" over the top of them.
  const answerGiven = revealed !== null || flipped;

  // Freeze the elapsed time at the same instant the countdown stops. Anything
  // after this point is reading the explanation or choosing a self-grade, which
  // is not time spent answering.
  useEffect(() => {
    if (answerGiven && answerTimeRef.current === null) {
      answerTimeRef.current = Date.now() - startedAtRef.current;
    }
  }, [answerGiven]);

  useEffect(() => {
    if (remaining === null || answerGiven) return undefined;
    if (remaining <= 0) {
      if (session?.settings.timer.autoAdvance) submitAnswer('again', false, true);
      return undefined;
    }
    const timer = setTimeout(() => setRemaining((r) => (r !== null ? r - 1 : r)), 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining, answerGiven]);

  if (!deckId) return <Navigate to="/app/decks" replace />;
  if (!session || session.deckId !== deckId) {
    return <Navigate to={`/app/study/${deckId}`} replace />;
  }
  if (session.status === 'completed') {
    return <Navigate to={`/app/study/${deckId}/results/${session.id}`} replace />;
  }
  // The card in the queue is no longer in the deck — deleted on another device
  // mid-run, or the deck itself was. This used to redirect silently, which
  // looked like the app had thrown the session away for no reason.
  if (!currentCard) {
    return (
      <MissingCard
        t={t}
        deckId={deckId}
        onEnd={() => {
          pauseAndAbandon();
          navigate(`/app/decks/${deckId}`);
        }}
      />
    );
  }

  const total = session.queue.length;
  const position = session.position;
  const isAutoGraded = currentCard.type === 'multiple-choice' || currentCard.type === 'true-false' || currentCard.type === 'type-in';

  function submitAnswer(grade: Grade, correct: boolean, timedOut: boolean, response?: string) {
    // Null only when the card was never answered — a timeout — where the full
    // elapsed time is the honest figure.
    const timeMs = answerTimeRef.current ?? Date.now() - startedAtRef.current;
    answer({
      cardId: currentCard!.id,
      grade,
      correct,
      timeMs,
      usedHint: hintRevealed,
      timedOut,
      response,
    });
  }

  function handleSelfGrade(grade: Grade) {
    submitAnswer(grade, grade !== 'again', false);
  }

  function handleChoiceSelect(choiceId: string) {
    if (revealed) return;
    setSelectedChoiceId(choiceId);
    const result = autoGrade(currentCard!, choiceId);
    setRevealed({ correct: result.correct, grade: result.grade });
  }

  function handleTypeInSubmit() {
    if (revealed || !typedResponse.trim()) return;
    const result = autoGrade(currentCard!, typedResponse);
    setRevealed({ correct: result.correct, grade: result.grade });
  }

  function handleNextAfterAutoGrade() {
    if (!revealed) return;
    submitAnswer(revealed.grade, revealed.correct, false, currentCard!.type === 'type-in' ? typedResponse : selectedChoiceId ?? undefined);
  }

  function handleExit() {
    if (confirm(t('runner.confirmEnd'))) {
      pauseAndAbandon();
      navigate(`/app/decks/${deckId}`);
    }
  }

  const promptText = getPromptText(currentCard, session.settings.reversed);
  const answerText = getAnswerText(currentCard, session.settings.reversed);

  return (
    <div className="flex min-h-screen flex-col bg-slate-950">
      <div className="flex items-center gap-4 px-4 py-4 sm:px-8">
        <button onClick={handleExit} className="text-slate-400 hover:text-white" aria-label={t('runner.exitSession')}>
          ✕
        </button>
        <div className="flex-1">
          <Progress value={position} max={total} className="bg-slate-800" barClassName="bg-brand-500" />
        </div>
        <span className="text-sm font-medium text-slate-400">
          {position + 1} / {total}
        </span>
        {session.settings.mode === 'survival' && (
          <span className="text-sm">
            {'❤️'.repeat(session.livesRemaining)}
            {'🖤'.repeat(SURVIVAL_LIVES - session.livesRemaining)}
          </span>
        )}
      </div>

      {remaining !== null && (
        <div className="px-4 sm:px-8">
          <Progress
            value={remaining}
            max={session.settings.timer.perCardSeconds}
            className="h-1 bg-slate-800"
            barClassName={remaining <= 5 ? 'bg-rose-500' : 'bg-sky-500'}
          />
        </div>
      )}

      <div className="flex flex-1 flex-col items-center justify-center px-4 py-8 sm:px-8">
        <div className="w-full max-w-xl">
          {!isAutoGraded ? (
            <>
              <CardFace
                card={currentCard}
                flipped={flipped}
                promptText={promptText}
                answerText={answerText}
                onFlip={() => setFlipped(true)}
              />
              {!flipped ? (
                <div className="mt-6 flex flex-col items-center gap-3">
                  {currentCard.hint && !hintRevealed && (
                    <button
                      onClick={() => setHintRevealed(true)}
                      className="text-sm font-medium text-slate-400 hover:text-slate-200"
                    >
                      {t('runner.showHint')}
                    </button>
                  )}
                  {hintRevealed && currentCard.hint && (
                    <p className="rounded-lg bg-slate-800 px-4 py-2 text-sm text-slate-300">{currentCard.hint}</p>
                  )}
                  <Button size="lg" onClick={() => setFlipped(true)} className="w-full max-w-xs">
                    {t('runner.showAnswer')}
                  </Button>
                </div>
              ) : (
                <div className="mt-6">
                  {currentCard.explanation && (
                    <p className="mb-4 rounded-lg bg-slate-800 px-4 py-3 text-center text-sm text-slate-300">
                      {currentCard.explanation}
                    </p>
                  )}
                  {session.settings.gradingScale === 'binary' ? (
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => handleSelfGrade('again')}
                        className={cn('rounded-xl py-3.5 font-semibold text-white transition-colors', GRADE_STYLES.again)}
                      >
                        {t('runner.incorrect')}
                      </button>
                      <button
                        onClick={() => handleSelfGrade('good')}
                        className={cn('rounded-xl py-3.5 font-semibold text-white transition-colors', GRADE_STYLES.good)}
                      >
                        {t('runner.correct')}
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-4 gap-2">
                      {(['again', 'hard', 'good', 'easy'] as Grade[]).map((grade) => (
                        <button
                          key={grade}
                          onClick={() => handleSelfGrade(grade)}
                          className={cn('rounded-xl py-3.5 text-sm font-semibold text-white transition-colors', GRADE_STYLES[grade])}
                        >
                          {t(`grade.${grade}` as const)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <AutoGradedCard
              t={t}
              card={currentCard}
              revealed={revealed}
              selectedChoiceId={selectedChoiceId}
              typedResponse={typedResponse}
              onTypedResponseChange={setTypedResponse}
              onChoiceSelect={handleChoiceSelect}
              onTypeInSubmit={handleTypeInSubmit}
              onNext={handleNextAfterAutoGrade}
              hintRevealed={hintRevealed}
              onRevealHint={() => setHintRevealed(true)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Shown when the queue points at a card the deck no longer has.
 *
 * Whatever has been answered so far is real and worth keeping, so ending the
 * run here files it rather than discarding it — `pauseAndAbandon` writes the
 * summary as long as at least one answer was given.
 */
function MissingCard({ t, deckId, onEnd }: { t: Translator; deckId: string; onEnd: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <div className="max-w-sm text-center">
        <span className="text-4xl">🃏</span>
        <h1 className="mt-4 text-lg font-semibold text-white">{t('runner.missingTitle')}</h1>
        <p className="mt-2 text-sm text-slate-400">{t('runner.missingBody')}</p>
        <div className="mt-6 flex justify-center gap-3">
          <Button onClick={onEnd}>{t('runner.endSession')}</Button>
          <Link
            to={`/app/study/${deckId}`}
            className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800"
          >
            {t('runner.startNewOne')}
          </Link>
        </div>
      </div>
    </div>
  );
}

function AutoGradedCard({
  t,
  card,
  revealed,
  selectedChoiceId,
  typedResponse,
  onTypedResponseChange,
  onChoiceSelect,
  onTypeInSubmit,
  onNext,
  hintRevealed,
  onRevealHint,
}: {
  t: Translator;
  card: Flashcard;
  revealed: { correct: boolean; grade: Grade } | null;
  selectedChoiceId: string | null;
  typedResponse: string;
  onTypedResponseChange: (v: string) => void;
  onChoiceSelect: (choiceId: string) => void;
  onTypeInSubmit: () => void;
  onNext: () => void;
  hintRevealed: boolean;
  onRevealHint: () => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center shadow-glow">
      <p className="text-lg font-semibold text-white sm:text-xl">{card.front}</p>

      {card.hint && !hintRevealed && !revealed && (
        <button onClick={onRevealHint} className="mt-3 text-sm font-medium text-slate-400 hover:text-slate-200">
          {t('runner.showHint')}
        </button>
      )}
      {hintRevealed && card.hint && <p className="mt-3 text-sm text-slate-400">{card.hint}</p>}

      {(card.type === 'multiple-choice' || card.type === 'true-false') && (
        <div className="mt-6 space-y-2 text-left">
          {(card.choices ?? []).map((choice) => {
            const isSelected = selectedChoiceId === choice.id;
            const showState = revealed !== null;
            return (
              <button
                key={choice.id}
                disabled={showState}
                onClick={() => onChoiceSelect(choice.id)}
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
            autoFocus
            disabled={revealed !== null}
            value={typedResponse}
            onChange={(e) => onTypedResponseChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onTypeInSubmit()}
            placeholder={t('runner.typePlaceholder')}
            className={cn(
              'w-full rounded-xl border bg-slate-800 px-4 py-3 text-center text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500',
              revealed === null
                ? 'border-slate-700'
                : revealed.correct
                  ? 'border-emerald-500'
                  : 'border-rose-500',
            )}
          />
          {revealed && !revealed.correct && (
            <p className="mt-2 text-sm text-slate-400">
              {t('runner.accepted', { answers: (card.acceptedAnswers ?? [card.back]).join(', ') })}
            </p>
          )}
          {revealed === null && (
            <Button className="mt-4 w-full" onClick={onTypeInSubmit} disabled={!typedResponse.trim()}>
              {t('runner.submit')}
            </Button>
          )}
        </div>
      )}

      {revealed && (
        <div className="mt-6">
          <p className={cn('mb-3 text-sm font-semibold', revealed.correct ? 'text-emerald-400' : 'text-rose-400')}>
            {revealed.correct ? t('runner.correctBang') : t('runner.notQuite')}
          </p>
          {card.explanation && <p className="mb-4 text-sm text-slate-400">{card.explanation}</p>}
          <Button size="lg" className="w-full" onClick={onNext}>
            {t('runner.nextCard')}
          </Button>
        </div>
      )}
    </div>
  );
}
