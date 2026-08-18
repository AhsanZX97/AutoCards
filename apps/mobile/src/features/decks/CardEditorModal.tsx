import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  CARD_TYPES,
  DIFFICULTIES,
  createEmptyDraft,
  createId,
  demoteRetiredCard,
  type CardDraft,
  type Category,
  type Choice,
} from '@autocards/core';
import { useApp } from '../../lib/appContext';
import { useT } from '../../lib/i18n';
import { useTheme, radius, spacing } from '../../lib/theme';
import { toast } from '../../lib/toastStore';
import { Button, Chip, Field, Modal, SelectField } from '../../components';

interface CardEditorModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (draft: CardDraft) => void;
  initial: CardDraft | null;
  categories: Category[];
}

function emptyChoice(): Choice {
  return { id: createId('choice'), text: '', correct: false };
}

/** Mirrors the web's `CardEditorModal.tsx` — same fields, same validation,
 *  same normalize-on-save rules, laid out as a bottom sheet instead of a
 *  centered dialog. */
export function CardEditorModal({ open, onClose, onSave, initial, categories }: CardEditorModalProps) {
  const app = useApp();
  const t = useT();
  const theme = useTheme();
  const [draft, setDraft] = useState<CardDraft>(() => demoteRetiredCard(initial ?? createEmptyDraft()));
  const [suggestingChoice, setSuggestingChoice] = useState(false);

  useEffect(() => {
    if (open) setDraft(demoteRetiredCard(initial ?? createEmptyDraft()));
  }, [open, initial]);

  function update<K extends keyof CardDraft>(key: K, value: CardDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function updateChoice(id: string, patch: Partial<Choice>) {
    update('choices', (draft.choices ?? []).map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  function addChoice() {
    update('choices', [...(draft.choices ?? []), emptyChoice()]);
  }

  function removeChoice(id: string) {
    update('choices', (draft.choices ?? []).filter((c) => c.id !== id));
  }

  async function addAiChoice() {
    setSuggestingChoice(true);
    try {
      const model = app.settingsStore.getState().generationDefaults.model;
      const text = await app.services.llm.suggestChoice({
        front: draft.front,
        back: draft.back,
        existingChoices: (draft.choices ?? []).map((c) => c.text).filter(Boolean),
        model,
      });
      update('choices', [...(draft.choices ?? []), { id: createId('choice'), text, correct: false }]);
    } catch (error) {
      toast({
        variant: 'error',
        title: error instanceof Error ? error.message : t('cardEditor.suggestChoiceFailed'),
      });
    } finally {
      setSuggestingChoice(false);
    }
  }

  function handleSave() {
    onSave(normalizeDraft(draft));
  }

  const isValid = validateDraft(draft);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? t('cardEditor.editTitle') : t('cardEditor.newTitle')}
      footer={
        <>
          <Button title={t('cardEditor.cancel')} variant="ghost" onPress={onClose} style={{ flex: 1 }} />
          <Button title={t('cardEditor.saveCard')} onPress={handleSave} disabled={!isValid} style={{ flex: 1 }} />
        </>
      }
    >
      <SelectField
        label={t('cardEditor.cardType')}
        value={draft.type}
        onChange={(v) => update('type', v as CardDraft['type'])}
        options={CARD_TYPES.map((type) => ({ value: type, label: t(`cardType.${type}` as const) }))}
      />

      <Field
        label={t('cardEditor.front')}
        multiline
        numberOfLines={2}
        value={draft.front}
        onChangeText={(v) => update('front', v)}
        placeholder={t('cardEditor.frontPlaceholder')}
      />
      <Field
        label={t('cardEditor.back')}
        multiline
        numberOfLines={2}
        value={draft.back}
        onChangeText={(v) => update('back', v)}
        placeholder={t('cardEditor.backPlaceholder')}
      />

      {(draft.type === 'multiple-choice' || draft.type === 'true-false') && (
        <View style={{ marginBottom: spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: theme.text }}>{t('cardEditor.choices')}</Text>
            {draft.type === 'multiple-choice' && (
              <View style={{ flexDirection: 'row', gap: spacing.md }}>
                <Pressable onPress={addAiChoice} disabled={suggestingChoice}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: theme.primaryText, opacity: suggestingChoice ? 0.5 : 1 }}>
                    {suggestingChoice ? t('cardEditor.thinking') : t('cardEditor.aiChoice')}
                  </Text>
                </Pressable>
                <Pressable onPress={addChoice}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: theme.primaryText }}>{t('cardEditor.addChoice')}</Text>
                </Pressable>
              </View>
            )}
          </View>
          <View style={{ gap: spacing.sm }}>
            {(draft.choices ?? []).map((choice) => (
              <View key={choice.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Pressable
                  onPress={() => updateChoice(choice.id, { correct: !choice.correct })}
                  accessibilityLabel={choice.correct ? t('cardEditor.correctAnswer') : t('cardEditor.markAsCorrect')}
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: radius.sm,
                    borderWidth: 1.5,
                    borderColor: choice.correct ? theme.success : theme.borderStrong,
                    backgroundColor: choice.correct ? theme.successSoft : 'transparent',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {choice.correct && <Text style={{ color: theme.success, fontWeight: '800' }}>✓</Text>}
                </Pressable>
                <View style={{ flex: 1 }}>
                  <Field
                    label=""
                    value={choice.text}
                    onChangeText={(v) => updateChoice(choice.id, { text: v })}
                    placeholder={t('cardEditor.choiceTextPlaceholder')}
                    editable={draft.type !== 'true-false'}
                    style={{ marginBottom: 0 }}
                  />
                </View>
                {draft.type === 'multiple-choice' && (draft.choices?.length ?? 0) > 2 && (
                  <Pressable onPress={() => removeChoice(choice.id)}>
                    <Text style={{ color: theme.textFaint, fontSize: 16 }}>✕</Text>
                  </Pressable>
                )}
              </View>
            ))}
          </View>
        </View>
      )}

      {draft.type === 'type-in' && (
        <Field
          label={t('cardEditor.acceptedAnswers')}
          hint={t('cardEditor.acceptedAnswersHint')}
          value={(draft.acceptedAnswers ?? []).join(', ')}
          onChangeText={(v) => update('acceptedAnswers', v.split(',').map((s) => s.trim()).filter(Boolean))}
          placeholder={t('cardEditor.acceptedAnswersPlaceholder')}
        />
      )}

      <SelectField
        label={t('cardEditor.difficulty')}
        value={draft.difficulty}
        onChange={(v) => update('difficulty', v as CardDraft['difficulty'])}
        options={DIFFICULTIES.map((d) => ({ value: d, label: t(`difficulty.${d}` as const) }))}
      />

      <SelectField
        label={t('cardEditor.category')}
        value={draft.categoryId ?? ''}
        onChange={(v) => update('categoryId', v || undefined)}
        options={[{ value: '', label: t('cardEditor.noCategory') }, ...categories.map((c) => ({ value: c.id, label: `${c.icon} ${c.name}` }))]}
      />

      <Field label={t('cardEditor.hint')} hint={t('common.optional')} value={draft.hint ?? ''} onChangeText={(v) => update('hint', v)} />

      <Field
        label={t('cardEditor.explanation')}
        hint={t('common.optional')}
        multiline
        numberOfLines={2}
        value={draft.explanation ?? ''}
        onChangeText={(v) => update('explanation', v)}
      />

      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <Chip label={t('cardEditor.starred')} active={draft.starred ?? false} onPress={() => update('starred', !draft.starred)} />
        <Chip label={t('cardEditor.suspended')} active={draft.suspended ?? false} onPress={() => update('suspended', !draft.suspended)} />
      </View>
    </Modal>
  );
}

function normalizeDraft(draft: CardDraft): CardDraft {
  if (draft.type === 'true-false' && (!draft.choices || draft.choices.length === 0)) {
    return {
      ...draft,
      choices: [
        { id: createId('choice'), text: 'True', correct: draft.back?.toLowerCase() !== 'false' },
        { id: createId('choice'), text: 'False', correct: draft.back?.toLowerCase() === 'false' },
      ],
    };
  }
  if (draft.type === 'multiple-choice' && (!draft.choices || draft.choices.length < 2)) {
    return {
      ...draft,
      choices: [emptyChoice(), emptyChoice()],
    };
  }
  return draft;
}

function validateDraft(draft: CardDraft): boolean {
  if (!draft.front.trim()) return false;
  if (draft.type === 'multiple-choice') {
    const choices = draft.choices ?? [];
    return choices.length >= 2 && choices.every((c) => c.text.trim()) && choices.some((c) => c.correct);
  }
  if (draft.type === 'type-in') return (draft.acceptedAnswers ?? []).length > 0 || Boolean(draft.back.trim());
  return Boolean(draft.back.trim()) || draft.type === 'true-false';
}
