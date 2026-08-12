import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import {
  autoGrade,
  currentCardId as getCurrentCardId,
  hasCloze,
  parseCloze,
  type Flashcard,
  type Grade,
} from '@autocards/core';
import { useApp } from '../../../src/lib/appContext';
import { useTheme, useDifficultyColors, radius, spacing } from '../../../src/lib/theme';
import { Badge, Button, Card, ProgressBar, Screen } from '../../../src/components';
import { EMPTY_ARRAY } from '../../../src/lib/empty';

const GRADE_COLOR: Record<Grade, string> = {
  again: '#e11d48',
  hard: '#d97706',
  good: '#059669',
  easy: '#0ea5e9',
};
const GRADE_LABEL: Record<Grade, string> = { again: 'Again', hard: 'Hard', good: 'Good', easy: 'Easy' };

export default function StudyRunnerScreen() {
  const { deckId } = useLocalSearchParams<{ deckId: string }>();
  const app = useApp();
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
  const startedAtRef = useRef(Date.now());

  useEffect(() => {
    // Cram mode re-appends a missed card to the end of the queue, so the
    // *same* card can become current again right after being answered wrong
    // — keying this off `currentId` would then skip the reset entirely,
    // since the id didn't change even though it's a fresh attempt. Keying
    // off `position` (which always advances by one per answer) guarantees a
    // reset every time, matching web's `[session?.position]`.
    startedAtRef.current = Date.now();
    setFlipped(false);
    setHintRevealed(false);
    setTypedResponse('');
    setSelectedChoiceId(null);
    setRevealed(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.position]);

  useEffect(() => {
    if (session?.status === 'completed') {
      router.replace(`/study/${deckId}/results/${session.id}`);
    }
  }, [session?.status, session?.id, deckId]);

  if (!session || session.deckId !== deckId) {
    return (
      <Screen scroll={false}>
        <Text style={{ color: theme.textMuted }}>No active session.</Text>
      </Screen>
    );
  }
  if (!currentCard) {
    return (
      <Screen scroll={false}>
        <ActivityHint theme={theme} />
      </Screen>
    );
  }

  function submitAnswer(grade: Grade, correct: boolean, response?: string) {
    const timeMs = Date.now() - startedAtRef.current;
    answer({ cardId: currentCard!.id, grade, correct, timeMs, usedHint: hintRevealed, timedOut: false, response });
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
    Alert.alert('End session?', 'Your progress on answered cards will be saved.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End session',
        style: 'destructive',
        onPress: () => {
          pauseAndAbandon();
          router.replace(`/(app)/decks/${deckId}`);
        },
      },
    ]);
  }

  const isAutoGraded = currentCard.type === 'multiple-choice' || currentCard.type === 'true-false' || currentCard.type === 'type-in';
  const promptText = getPromptText(currentCard);
  const answerText = getAnswerText(currentCard);

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg }}>
        <Pressable onPress={handleExit}>
          <Text style={{ color: theme.textMuted, fontSize: 18 }}>✕</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <ProgressBar value={session.position} max={session.queue.length} />
        </View>
        <Text style={{ color: theme.textFaint, fontSize: 12 }}>
          {session.position + 1}/{session.queue.length}
        </Text>
      </View>

      {!isAutoGraded ? (
        <Card style={{ alignItems: 'center', paddingVertical: spacing.xxl }}>
          <Badge
            label={currentCard.difficulty}
            color={difficultyColors[currentCard.difficulty]}
            softColor={`${difficultyColors[currentCard.difficulty]}22`}
          />
          <Text style={{ fontSize: 18, fontWeight: '700', color: theme.text, textAlign: 'center', marginTop: spacing.lg }}>
            {flipped ? answerText : promptText}
          </Text>

          {!flipped ? (
            <View style={{ alignItems: 'center', marginTop: spacing.xl, width: '100%' }}>
              {currentCard.hint && !hintRevealed && (
                <Pressable onPress={() => setHintRevealed(true)} style={{ marginBottom: spacing.md }}>
                  <Text style={{ color: theme.textMuted, fontSize: 13 }}>💡 Show hint</Text>
                </Pressable>
              )}
              {hintRevealed && currentCard.hint && (
                <Text style={{ color: theme.textMuted, fontSize: 13, marginBottom: spacing.md, textAlign: 'center' }}>
                  {currentCard.hint}
                </Text>
              )}
              <Button title="Show answer" onPress={() => setFlipped(true)} style={{ width: '100%' }} />
            </View>
          ) : (
            <View style={{ width: '100%', marginTop: spacing.xl }}>
              {currentCard.explanation && (
                <Text style={{ color: theme.textMuted, fontSize: 13, textAlign: 'center', marginBottom: spacing.lg }}>
                  {currentCard.explanation}
                </Text>
              )}
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                {(['again', 'hard', 'good', 'easy'] as Grade[]).map((grade) => (
                  <Pressable
                    key={grade}
                    onPress={() => submitAnswer(grade, grade !== 'again')}
                    style={{
                      flex: 1,
                      paddingVertical: spacing.md,
                      borderRadius: radius.md,
                      alignItems: 'center',
                      backgroundColor: GRADE_COLOR[grade],
                    }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>{GRADE_LABEL[grade]}</Text>
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
                placeholder="Type your answer…"
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
              {revealed === null && (
                <Button title="Submit" onPress={handleTypeInSubmit} disabled={!typedResponse.trim()} style={{ marginTop: spacing.md }} />
              )}
            </View>
          )}

          {revealed && (
            <View style={{ width: '100%', marginTop: spacing.lg, alignItems: 'center' }}>
              <Text style={{ color: revealed.correct ? theme.success : theme.danger, fontWeight: '700', marginBottom: spacing.sm }}>
                {revealed.correct ? '✓ Correct!' : '✗ Not quite'}
              </Text>
              {currentCard.explanation && (
                <Text style={{ color: theme.textMuted, fontSize: 13, textAlign: 'center', marginBottom: spacing.md }}>
                  {currentCard.explanation}
                </Text>
              )}
              <Button
                title="Next card"
                style={{ width: '100%' }}
                onPress={() =>
                  submitAnswer(revealed.grade, revealed.correct, currentCard.type === 'type-in' ? typedResponse : selectedChoiceId ?? undefined)
                }
              />
            </View>
          )}
        </Card>
      )}
    </Screen>
  );
}

function ActivityHint({ theme }: { theme: ReturnType<typeof useTheme> }) {
  return <Text style={{ color: theme.textMuted, padding: spacing.lg }}>Loading…</Text>;
}

function getPromptText(card: Flashcard): string {
  if (card.type === 'cloze' && card.clozeText && hasCloze(card.clozeText)) return parseCloze(card.clozeText).prompt;
  return card.front;
}

function getAnswerText(card: Flashcard): string {
  if (card.type === 'cloze' && card.clozeText && hasCloze(card.clozeText)) return parseCloze(card.clozeText).answer;
  return card.back;
}
