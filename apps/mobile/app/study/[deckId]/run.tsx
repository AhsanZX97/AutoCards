import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import {
  GRADES,
  SURVIVAL_LIVES,
  autoGrade,
  currentCardId as getCurrentCardId,
  getAnswerText,
  getPromptText,
  type Grade,
} from '@autocards/core';
import { useApp } from '../../../src/lib/appContext';
import { useT } from '../../../src/lib/i18n';
import { useTheme, useDifficultyColors, radius, spacing } from '../../../src/lib/theme';
import { Badge, Button, Card, ProgressBar, Screen } from '../../../src/components';
import { EMPTY_ARRAY } from '../../../src/lib/empty';

const GRADE_COLOR: Record<Grade, string> = {
  again: '#e11d48',
  hard: '#d97706',
  good: '#059669',
  easy: '#0ea5e9',
};

interface GradeButton {
  grade: Grade;
}

const FOUR_POINT_BUTTONS: GradeButton[] = GRADES.map((grade) => ({ grade }));

/** Exam forces the binary scale: the learner marks themselves right or wrong,
 *  with no shades in between. `again` and `good` are the two grades the
 *  scheduler already treats as fail and pass. */
const BINARY_BUTTONS: GradeButton[] = [{ grade: 'again' }, { grade: 'good' }];

/** Seconds left at which the countdown bar turns red, matching web. */
const TIMER_WARNING_SECONDS = 5;

export default function StudyRunnerScreen() {
  const { deckId } = useLocalSearchParams<{ deckId: string }>();
  const app = useApp();
  const t = useT();
  const theme = useTheme();
  const difficultyColors = useDifficultyColors();

  const session = app.studyStore((s) => s.activeSession);
  const answer = app.studyStore((s) => s.answer);
  const pauseAndAbandon = app.studyStore((s) => s.pauseAndAbandon);
  const cards = app.deckStore((s) => (deckId ? s.cardsByDeck[deckId] ?? EMPTY_ARRAY : EMPTY_ARRAY));

  const cardsById = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const currentId = session ? getCurrentCardId(session) : undefined;
  const currentCard = currentId ? cardsById.get(currentId) : undefined;

  const [flipped, setFlipped] = useState(false);
  const [hintRevealed, setHintRevealed] = useState(false);
  const [typedResponse, setTypedResponse] = useState('');
  const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<{ correct: boolean; grade: Grade } | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);

  const startedAtRef = useRef(Date.now());
  // How long the card actually took to answer, frozen the moment the answer is
  // locked in. Without this the clock would keep running while the learner
  // reads the explanation, and that reading time would be scored as thinking
  // time — enough on its own to wipe out the speed bonus on every card.
  const answerTimeRef = useRef<number | null>(null);

  useEffect(() => {
    // Cram mode re-appends a missed card to the end of the queue, so the
    // *same* card can become current again right after being answered wrong
    // — keying this off `currentId` would then skip the reset entirely,
    // since the id didn't change even though it's a fresh attempt. Keying
    // off `position` (which always advances by one per answer) guarantees a
    // reset every time, matching web's `[session?.position]`.
    startedAtRef.current = Date.now();
    answerTimeRef.current = null;
    setFlipped(false);
    setHintRevealed(false);
    setTypedResponse('');
    setSelectedChoiceId(null);
    setRevealed(null);
    setRemaining(session?.settings.timer.enabled ? session.settings.timer.perCardSeconds : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.position]);

  useEffect(() => {
    if (session?.status === 'completed') {
      router.replace(`/study/${deckId}/results/${session.id}`);
    }
  }, [session?.status, session?.id, deckId]);

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
    // No card means the queue points at something the deck no longer has; there
    // is nothing to time and nothing to submit an answer against.
    //
    // `currentCard` is deliberately *not* a dependency. Answering rewrites the
    // card to bump its mastery, so it comes back a new object — and in the
    // commit right after a timeout submit, `remaining` is still 0 because the
    // reset above is only queued. Depending on the card identity would re-enter
    // this effect on that commit and fire a second "again", skipping a card.
    // Re-running each tick keeps the closure at most one tick stale, and at the
    // instant `remaining` reaches 0 it is the current render's.
    if (remaining === null || answerGiven || !currentCard) return undefined;
    if (remaining <= 0) {
      if (session?.settings.timer.autoAdvance) submitAnswer('again', false, true);
      return undefined;
    }
    const timer = setTimeout(() => setRemaining((r) => (r !== null ? r - 1 : r)), 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining, answerGiven]);

  if (!session || session.deckId !== deckId) {
    return (
      <Screen scroll={false}>
        <Text style={{ color: theme.textMuted }}>{t('mobileRunner.noActiveSession')}</Text>
      </Screen>
    );
  }
  // The card in the queue is no longer in the deck — deleted on another device
  // mid-run, or the deck itself was. This used to sit on a bare "Loading…"
  // spinner forever, which looked like the app had frozen.
  if (!currentCard) {
    return (
      <MissingCard
        t={t}
        onEnd={() => {
          pauseAndAbandon();
          router.replace(`/(app)/decks/${deckId}`);
        }}
        onRestart={() => router.replace(`/study/${deckId}/setup`)}
      />
    );
  }

  function submitAnswer(grade: Grade, correct: boolean, timedOut: boolean, response?: string) {
    // Null only when the card was never answered — a timeout — where the full
    // elapsed time is the honest figure.
    const timeMs = answerTimeRef.current ?? Date.now() - startedAtRef.current;
    answer({ cardId: currentCard!.id, grade, correct, timeMs, usedHint: hintRevealed, timedOut, response });
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

  function handleExit() {
    Alert.alert(t('mobileRunner.endSessionTitle'), t('mobileRunner.endSessionBody'), [
      { text: t('mobileRunner.cancel'), style: 'cancel' },
      {
        text: t('mobileRunner.endSession'),
        style: 'destructive',
        onPress: () => {
          pauseAndAbandon();
          router.replace(`/(app)/decks/${deckId}`);
        },
      },
    ]);
  }

  const isAutoGraded = currentCard.type === 'multiple-choice' || currentCard.type === 'true-false' || currentCard.type === 'type-in';
  const promptText = getPromptText(currentCard, session.settings.reversed);
  const answerText = getAnswerText(currentCard, session.settings.reversed);
  const hint = currentCard.hint;
  const isBinary = session.settings.gradingScale === 'binary';
  const gradeButtons = isBinary ? BINARY_BUTTONS : FOUR_POINT_BUTTONS;
  const gradeLabel = (grade: Grade) =>
    isBinary ? t(grade === 'again' ? 'runner.incorrect' : 'runner.correct') : t(`grade.${grade}` as const);

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md }}>
        <Pressable onPress={handleExit}>
          <Text style={{ color: theme.textMuted, fontSize: 18 }}>✕</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <ProgressBar value={session.position} max={session.queue.length} />
        </View>
        <Text style={{ color: theme.textFaint, fontSize: 12 }}>
          {session.position + 1}/{session.queue.length}
        </Text>
        {session.settings.mode === 'survival' && (
          <Text style={{ fontSize: 12 }}>
            {'❤️'.repeat(session.livesRemaining)}
            {'🖤'.repeat(SURVIVAL_LIVES - session.livesRemaining)}
          </Text>
        )}
      </View>

      {remaining !== null && (
        <View style={{ marginBottom: spacing.lg }}>
          <ProgressBar
            value={remaining}
            max={session.settings.timer.perCardSeconds}
            height={4}
            color={remaining <= TIMER_WARNING_SECONDS ? theme.dangerSolid : theme.primary}
          />
        </View>
      )}

      {!isAutoGraded ? (
        <Card style={{ alignItems: 'center', paddingVertical: spacing.xxl }}>
          <Badge
            label={t(`difficulty.${currentCard.difficulty}` as const)}
            color={difficultyColors[currentCard.difficulty]}
            softColor={`${difficultyColors[currentCard.difficulty]}22`}
          />
          <Text style={{ fontSize: 18, fontWeight: '700', color: theme.text, textAlign: 'center', marginTop: spacing.lg }}>
            {flipped ? answerText : promptText}
          </Text>

          {!flipped ? (
            <View style={{ alignItems: 'center', marginTop: spacing.xl, width: '100%' }}>
              {hint && !hintRevealed && (
                <Pressable onPress={() => setHintRevealed(true)} style={{ marginBottom: spacing.md }}>
                  <Text style={{ color: theme.textMuted, fontSize: 13 }}>{t('runner.showHint')}</Text>
                </Pressable>
              )}
              {hintRevealed && hint && (
                <Text style={{ color: theme.textMuted, fontSize: 13, marginBottom: spacing.md, textAlign: 'center' }}>
                  {hint}
                </Text>
              )}
              <Button title={t('runner.showAnswer')} onPress={() => setFlipped(true)} style={{ width: '100%' }} />
            </View>
          ) : (
            <View style={{ width: '100%', marginTop: spacing.xl }}>
              {currentCard.explanation && (
                <Text style={{ color: theme.textMuted, fontSize: 13, textAlign: 'center', marginBottom: spacing.lg }}>
                  {currentCard.explanation}
                </Text>
              )}
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                {gradeButtons.map(({ grade }) => (
                  <Pressable
                    key={grade}
                    onPress={() => handleSelfGrade(grade)}
                    style={{
                      flex: 1,
                      paddingVertical: spacing.md,
                      borderRadius: radius.md,
                      alignItems: 'center',
                      backgroundColor: GRADE_COLOR[grade],
                    }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>{gradeLabel(grade)}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
        </Card>
      ) : (
        <Card style={{ alignItems: 'center', paddingVertical: spacing.xl }}>
          <Text style={{ fontSize: 17, fontWeight: '700', color: theme.text, textAlign: 'center' }}>
            {currentCard.front}
          </Text>

          {hint && !hintRevealed && !revealed && (
            <Pressable onPress={() => setHintRevealed(true)} style={{ marginTop: spacing.md }}>
              <Text style={{ color: theme.textMuted, fontSize: 13 }}>{t('runner.showHint')}</Text>
            </Pressable>
          )}
          {hintRevealed && hint && (
            <Text style={{ color: theme.textMuted, fontSize: 13, marginTop: spacing.md, textAlign: 'center' }}>
              {hint}
            </Text>
          )}

          {(currentCard.type === 'multiple-choice' || currentCard.type === 'true-false') && (
            <View style={{ width: '100%', gap: spacing.sm, marginTop: spacing.lg }}>
              {(currentCard.choices ?? []).map((choice) => {
                const isSelected = selectedChoiceId === choice.id;
                const showState = revealed !== null;
                const borderColor = !showState
                  ? theme.border
                  : choice.correct
                    ? theme.success
                    : isSelected
                      ? theme.danger
                      : theme.border;
                return (
                  <Pressable
                    key={choice.id}
                    disabled={showState}
                    onPress={() => handleChoiceSelect(choice.id)}
                    style={{
                      borderWidth: 1,
                      borderColor,
                      borderRadius: radius.md,
                      padding: spacing.md,
                      backgroundColor: showState && choice.correct ? theme.successSoft : theme.surface,
                    }}
                  >
                    <Text style={{ color: theme.text, fontSize: 14 }}>{choice.text}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          {currentCard.type === 'type-in' && (
            <View style={{ width: '100%', marginTop: spacing.lg }}>
              <TextInput
                editable={revealed === null}
                value={typedResponse}
                onChangeText={setTypedResponse}
                onSubmitEditing={handleTypeInSubmit}
                placeholder={t('runner.typePlaceholder')}
                placeholderTextColor={theme.textFaint}
                style={{
                  borderWidth: 1,
                  borderColor: revealed === null ? theme.border : revealed.correct ? theme.success : theme.danger,
                  borderRadius: radius.md,
                  padding: spacing.md,
                  textAlign: 'center',
                  fontSize: 15,
                  color: theme.text,
                }}
              />
              {/* A wrong answer is only useful if it says what would have been
                  right — otherwise the learner retypes the same near-miss. */}
              {revealed && !revealed.correct && (
                <Text style={{ color: theme.textMuted, fontSize: 13, marginTop: spacing.sm, textAlign: 'center' }}>
                  {t('runner.accepted', { answers: (currentCard.acceptedAnswers ?? [currentCard.back]).join(', ') })}
                </Text>
              )}
              {revealed === null && (
                <Button title={t('runner.submit')} onPress={handleTypeInSubmit} disabled={!typedResponse.trim()} style={{ marginTop: spacing.md }} />
              )}
            </View>
          )}

          {revealed && (
            <View style={{ width: '100%', marginTop: spacing.lg, alignItems: 'center' }}>
              <Text style={{ color: revealed.correct ? theme.success : theme.danger, fontWeight: '700', marginBottom: spacing.sm }}>
                {revealed.correct ? t('runner.correctBang') : t('runner.notQuite')}
              </Text>
              {currentCard.explanation && (
                <Text style={{ color: theme.textMuted, fontSize: 13, textAlign: 'center', marginBottom: spacing.md }}>
                  {currentCard.explanation}
                </Text>
              )}
              <Button
                title={t('runner.nextCard')}
                style={{ width: '100%' }}
                onPress={() =>
                  submitAnswer(
                    revealed.grade,
                    revealed.correct,
                    false,
                    currentCard.type === 'type-in' ? typedResponse : selectedChoiceId ?? undefined,
                  )
                }
              />
            </View>
          )}
        </Card>
      )}
    </Screen>
  );
}

/**
 * Shown when the queue points at a card the deck no longer has.
 *
 * Whatever has been answered so far is real and worth keeping, so ending the
 * run here files it rather than discarding it — `pauseAndAbandon` writes the
 * summary as long as at least one answer was given.
 */
function MissingCard({ t, onEnd, onRestart }: { t: ReturnType<typeof useT>; onEnd: () => void; onRestart: () => void }) {
  const theme = useTheme();
  return (
    <Screen scroll={false} style={{ justifyContent: 'center', alignItems: 'center', padding: spacing.lg }}>
      <Text style={{ fontSize: 34 }}>🃏</Text>
      <Text style={{ fontSize: 17, fontWeight: '700', color: theme.text, marginTop: spacing.md, textAlign: 'center' }}>
        {t('runner.missingTitle')}
      </Text>
      <Text style={{ color: theme.textMuted, fontSize: 13, marginTop: spacing.sm, textAlign: 'center' }}>
        {t('runner.missingBody')}
      </Text>
      <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl }}>
        <Button title={t('runner.endSession')} onPress={onEnd} />
        <Button title={t('runner.startNewOne')} variant="outline" onPress={onRestart} />
      </View>
    </Screen>
  );
}
