import { useEffect, useState } from 'react';
import {
  CARD_TYPES,
  DIFFICULTIES,
  createId,
  demoteRetiredCard,
  type CardDraft,
  type Category,
  type Choice,
} from '@autocards/core';
import { Button, Field, Input, Modal, Select, Switch, Textarea } from '../../components/ui';
import { Chip } from '../../components/ui/Chip';
import { toast } from '../../components/ui/toastStore';
import { useApp } from '../../lib/appContext';
import { useT } from '../../lib/i18n';

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

export function CardEditorModal({ open, onClose, onSave, initial, categories }: CardEditorModalProps) {
  const app = useApp();
  const t = useT();
  // A card written when cloze still existed opens as the plain question and
  // answer it becomes, rather than as a type the picker can no longer show.
  const [draft, setDraft] = useState<CardDraft>(() => demoteRetiredCard(initial ?? blankDraft()));
  const [suggestingChoice, setSuggestingChoice] = useState(false);

  useEffect(() => {
    if (open) setDraft(demoteRetiredCard(initial ?? blankDraft()));
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
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('cardEditor.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={!isValid}>
            {t('cardEditor.saveCard')}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Field label={t('cardEditor.cardType')}>
          <Select value={draft.type} onChange={(e) => update('type', e.target.value as CardDraft['type'])}>
            {CARD_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`cardType.${type}` as const)}
              </option>
            ))}
          </Select>
        </Field>

        <Field label={t('cardEditor.front')}>
          <Textarea rows={2} value={draft.front} onChange={(e) => update('front', e.target.value)} placeholder={t('cardEditor.frontPlaceholder')} />
        </Field>
        <Field label={t('cardEditor.back')}>
          <Textarea rows={2} value={draft.back} onChange={(e) => update('back', e.target.value)} placeholder={t('cardEditor.backPlaceholder')} />
        </Field>

        {(draft.type === 'multiple-choice' || draft.type === 'true-false') && (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('cardEditor.choices')}</p>
              {draft.type === 'multiple-choice' && (
                <div className="flex items-center gap-3">
                  <button
                    onClick={addAiChoice}
                    disabled={suggestingChoice}
                    className="text-xs font-semibold text-brand-700 hover:text-brand-600 disabled:opacity-50 dark:text-brand-400"
                  >
                    {suggestingChoice ? t('cardEditor.thinking') : t('cardEditor.aiChoice')}
                  </button>
                  <button onClick={addChoice} className="text-xs font-semibold text-brand-700 hover:text-brand-600 dark:text-brand-400">
                    {t('cardEditor.addChoice')}
                  </button>
                </div>
              )}
            </div>
            <div className="space-y-2">
              {(draft.choices ?? []).map((choice) => (
                <div key={choice.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={choice.correct}
                    onChange={(e) => updateChoice(choice.id, { correct: e.target.checked })}
                    className="h-4 w-4 rounded border-slate-300 text-brand-700 focus:ring-brand-500"
                  />
                  <Input
                    className="flex-1"
                    value={choice.text}
                    onChange={(e) => updateChoice(choice.id, { text: e.target.value })}
                    placeholder={t('cardEditor.choiceTextPlaceholder')}
                    disabled={draft.type === 'true-false'}
                  />
                  {draft.type === 'multiple-choice' && (draft.choices?.length ?? 0) > 2 && (
                    <button onClick={() => removeChoice(choice.id)} className="text-slate-400 hover:text-rose-500">
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {draft.type === 'type-in' && (
          <Field label={t('cardEditor.acceptedAnswers')} hint={t('cardEditor.acceptedAnswersHint')}>
            <Input
              value={(draft.acceptedAnswers ?? []).join(', ')}
              onChange={(e) => update('acceptedAnswers', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
              placeholder={t('cardEditor.acceptedAnswersPlaceholder')}
            />
          </Field>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Field label={t('cardEditor.difficulty')}>
            <Select value={draft.difficulty} onChange={(e) => update('difficulty', e.target.value as CardDraft['difficulty'])}>
              {DIFFICULTIES.map((d) => (
                <option key={d} value={d}>
                  {t(`difficulty.${d}` as const)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('cardEditor.category')}>
            <Select value={draft.categoryId ?? ''} onChange={(e) => update('categoryId', e.target.value || undefined)}>
              <option value="">{t('cardEditor.noCategory')}</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.icon} {cat.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label={t('cardEditor.hint')} hint={t('common.optional')}>
          <Input value={draft.hint ?? ''} onChange={(e) => update('hint', e.target.value)} />
        </Field>

        <Field label={t('cardEditor.explanation')} hint={t('common.optional')}>
          <Textarea rows={2} value={draft.explanation ?? ''} onChange={(e) => update('explanation', e.target.value)} />
        </Field>

        <div className="flex items-center gap-6">
          <Chip active={draft.starred ?? false} onClick={() => update('starred', !draft.starred)}>
            {t('cardEditor.starred')}
          </Chip>
          <Chip active={draft.suspended ?? false} onClick={() => update('suspended', !draft.suspended)}>
            {t('cardEditor.suspended')}
          </Chip>
        </div>
      </div>
    </Modal>
  );
}

function blankDraft(): CardDraft {
  return {
    type: 'basic',
    front: '',
    back: '',
    difficulty: 'medium',
    priority: 'normal',
    tags: [],
    starred: false,
    suspended: false,
    weight: 1,
  };
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
