import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import {
  CARD_TYPE_LABELS,
  CARD_TYPES,
  DEFAULT_GENERATION_PRESET,
  DEFAULT_MODEL_ID,
  DIFFICULTIES,
  DOCUMENT_KIND_ICONS,
  GENERATION_PRESETS,
  GENERATION_PRESET_DESCRIPTIONS,
  GENERATION_PRESET_LABELS,
  GENERATION_STAGE_LABELS,
  GenerationAbortedError,
  SUPPORTED_FORMATS_LABEL,
  UploadQuotaExceededError,
  describeOversized,
  describeUnsupported,
  documentKindOf,
  getPromptText,
  isOversizedUpload,
  isSupportedDocument,
  resolvePreset,
  type CardType,
  type Deck,
  type Difficulty,
  type Flashcard,
  type GeneratedCard,
  type GenerationPresetId,
  type GenerationProgress,
} from '@autocards/core';
import { useApp } from '../../lib/appContext';
import { documentSourceFromUri } from '../../lib/pdfSource';
import { toast } from '../../lib/toastStore';
import { useTheme, spacing } from '../../lib/theme';
import { formatQuota, useUploadQuota } from '../../lib/useUploadQuota';
import { Button, Card, Chip, Field, Modal, Notice, ProgressBar, SelectField, Stepper, SwitchRow } from '../../components';

const AUTO_CATEGORY = '__auto__';
const NO_CATEGORY = '__none__';

type Step = 'setup' | 'generating' | 'error';

interface GenerateCardsModalProps {
  open: boolean;
  onClose: () => void;
  deck: Deck;
  /** Cards already in the deck — what the new batch must not repeat. */
  cards: Flashcard[];
}

/** Mirrors the web's `DeckGenerateCardsModal.tsx`: same pipeline as creating a
 *  deck (extract → generate → normalize), told what the deck already has via
 *  `avoidPrompts`, fed into `addGeneratedCards` instead of creating a new deck. */
export function GenerateCardsModal({ open, onClose, deck, cards }: GenerateCardsModalProps) {
  const app = useApp();
  const theme = useTheme();
  const quota = useUploadQuota();
  const defaults = app.settingsStore((s) => s.generationDefaults);
  const updateDefaults = app.settingsStore((s) => s.updateGenerationDefaults);
  const addGeneratedCards = app.deckStore((s) => s.addGeneratedCards);
  const abortRef = useRef<AbortController | null>(null);

  const [step, setStep] = useState<Step>('setup');
  const [file, setFile] = useState<{ uri: string; name: string; size: number } | null>(null);
  const [progress, setProgress] = useState<GenerationProgress | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  const [preset, setPreset] = useState<GenerationPresetId>(defaults.preset ?? DEFAULT_GENERATION_PRESET);
  const [cardCount, setCardCount] = useState(defaults.cardCount);
  const [cardTypes, setCardTypes] = useState<CardType[]>(defaults.cardTypes);
  const [difficulty, setDifficulty] = useState<Difficulty>(defaults.difficulty);
  const [categoryTarget, setCategoryTarget] = useState<string>(AUTO_CATEGORY);
  const [includeHints, setIncludeHints] = useState(defaults.includeHints);
  const [includeExplanations, setIncludeExplanations] = useState(defaults.includeExplanations);
  const [includeSourceQuotes, setIncludeSourceQuotes] = useState(defaults.includeSourceQuotes);
  const [readImages, setReadImages] = useState(defaults.readImages ?? false);
  const [instructions, setInstructions] = useState('');

  useEffect(() => {
    if (!open) return;
    setStep('setup');
    setFile(null);
    setProgress(null);
    setErrorMessage('');
    setCategoryTarget(AUTO_CATEGORY);
    setInstructions('');
  }, [open]);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function pickFile() {
    const result = await DocumentPicker.getDocumentAsync({ type: '*/*' });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const size = asset.size ?? 0;

    if (!isSupportedDocument(asset.name)) {
      toast({ variant: 'error', title: 'Cannot read that file', description: describeUnsupported(asset.name) });
      return;
    }
    if (isOversizedUpload(size)) {
      toast({ variant: 'error', title: 'That file is too big', description: describeOversized(asset.name, size) });
      return;
    }
    setFile({ uri: asset.uri, name: asset.name, size });
  }

  function toggleCardType(type: CardType) {
    setCardTypes((prev) => {
      if (prev.includes(type)) {
        if (prev.length === 1) return prev;
        return prev.filter((t) => t !== type);
      }
      return [...prev, type];
    });
  }

  function choosePreset(next: GenerationPresetId) {
    setPreset(next);
    setCardTypes(resolvePreset(next).suggestedCardTypes);
  }

  async function startGeneration() {
    if (!file || !quota.canUpload) return;
    const autoCategories = categoryTarget === AUTO_CATEGORY;

    setStep('generating');
    setErrorMessage('');
    updateDefaults({ preset, cardCount, cardTypes, difficulty, includeHints, includeExplanations, includeSourceQuotes, readImages });

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const source = documentSourceFromUri(file.uri, file.name, file.size);
      const document = await app.services.documents.extract(source);
      const result = await app.services.llm.generateDeck({
        signal: controller.signal,
        documents: [document],
        options: {
          model: DEFAULT_MODEL_ID,
          preset,
          cardCount,
          cardTypes,
          difficulty,
          autoCategories,
          includeHints,
          includeExplanations,
          includeSourceQuotes,
          readImages,
          instructions: instructions.trim() || undefined,
          language: 'en',
        },
        avoidPrompts: cards.map((card) => getPromptText(card)).filter(Boolean),
        onProgress: setProgress,
      });

      const { added, duplicates } = addGeneratedCards(
        deck.id,
        assignCategory(result.cards, categoryTarget),
        autoCategories ? result.categories : [],
      );
      quota.record(result.quota);

      if (added.length === 0) {
        setErrorMessage(
          'Every card written for this batch was already in the deck. Try a different section of the document, or add custom instructions pointing it somewhere new.',
        );
        setStep('error');
        return;
      }

      toast({
        variant: 'success',
        title: `${added.length} card${added.length === 1 ? '' : 's'} added`,
        description: duplicates > 0 ? `${duplicates} duplicate${duplicates === 1 ? ' was' : 's were'} skipped.` : undefined,
      });
      onClose();
    } catch (err) {
      if (err instanceof GenerationAbortedError) {
        setStep('setup');
        return;
      }
      if (err instanceof UploadQuotaExceededError && err.quota) quota.record(err.quota);
      setErrorMessage(err instanceof Error ? err.message : 'Something went wrong generating your cards.');
      setStep('error');
    } finally {
      abortRef.current = null;
    }
  }

  function cancelGeneration() {
    abortRef.current?.abort();
  }

  return (
    <Modal
      open={open}
      onClose={step === 'generating' ? cancelGeneration : onClose}
      title="Add cards from a document"
      description={`New cards are checked against the ${cards.length} already in ${deck.title}.`}
      footer={
        step === 'setup' ? (
          <>
            <Button title="Cancel" variant="ghost" onPress={onClose} style={{ flex: 1 }} />
            <Button
              title="Generate cards"
              onPress={startGeneration}
              disabled={!file || !quota.canUpload}
              style={{ flex: 1 }}
            />
          </>
        ) : step === 'error' ? (
          <>
            <Button title="Close" variant="ghost" onPress={onClose} style={{ flex: 1 }} />
            <Button title="Try again" onPress={() => setStep('setup')} style={{ flex: 1 }} />
          </>
        ) : (
          <Button title="Cancel generation" variant="ghost" onPress={cancelGeneration} style={{ flex: 1 }} />
        )
      }
    >
      {step === 'generating' && (
        <View style={{ alignItems: 'center', paddingVertical: spacing.xxl }}>
          <ActivityIndicator color={theme.primary} size="large" />
          <Text style={{ fontWeight: '700', color: theme.text, marginTop: spacing.lg }}>
            {progress ? GENERATION_STAGE_LABELS[progress.stage] : 'Getting started…'}
          </Text>
          {progress && <Text style={{ color: theme.textFaint, fontSize: 13, marginTop: 4 }}>{progress.message}</Text>}
          <View style={{ width: '100%', marginTop: spacing.lg }}>
            <ProgressBar value={progress?.progress ?? 0} />
          </View>
        </View>
      )}

      {step === 'error' && (
        <View style={{ alignItems: 'center', paddingVertical: spacing.xl }}>
          <Text style={{ fontSize: 32 }}>⚠️</Text>
          <Text style={{ fontWeight: '700', color: theme.text, marginTop: spacing.md }}>No cards were added</Text>
          <Text style={{ color: theme.textMuted, fontSize: 13, marginTop: 4, textAlign: 'center' }}>{errorMessage}</Text>
        </View>
      )}

      {step === 'setup' && (
        <View>
          {!quota.canUpload && (
            <View style={{ marginBottom: spacing.md }}>
              <Notice variant="warning">
                You have used all {quota.limit} of this month's generations. Your allowance resets on the 1st.
              </Notice>
            </View>
          )}

          <Card style={{ marginBottom: spacing.md }}>
            {file ? (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ flex: 1, marginRight: spacing.md }}>
                  <Text style={{ fontWeight: '700', color: theme.text }} numberOfLines={1}>
                    {DOCUMENT_KIND_ICONS[documentKindOf(file.name) ?? 'pdf']} {file.name}
                  </Text>
                  <Text style={{ fontSize: 12, color: theme.textFaint, marginTop: 2 }}>{Math.round(file.size / 1024)} KB</Text>
                </View>
                <Button title="Change" variant="ghost" size="sm" onPress={pickFile} />
              </View>
            ) : (
              <View style={{ alignItems: 'center', paddingVertical: spacing.lg }}>
                <Text style={{ fontSize: 32 }}>📄</Text>
                <Text style={{ fontWeight: '700', color: theme.text, marginTop: spacing.sm, textAlign: 'center' }}>
                  Choose another document
                </Text>
                <Text style={{ fontSize: 12, color: theme.textMuted, marginTop: 4, textAlign: 'center' }}>
                  Takes {SUPPORTED_FORMATS_LABEL}.
                </Text>
                <Button title="Browse files" onPress={pickFile} style={{ marginTop: spacing.md }} />
              </View>
            )}
          </Card>

          <Text style={{ fontSize: 13, fontWeight: '600', color: theme.text, marginBottom: spacing.sm }}>
            What are these cards for?
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {GENERATION_PRESETS.map((id) => (
              <Chip key={id} label={GENERATION_PRESET_LABELS[id]} active={preset === id} onPress={() => choosePreset(id)} />
            ))}
          </View>
          <Text style={{ fontSize: 12, color: theme.textMuted, marginTop: -4, marginBottom: spacing.md }}>
            {GENERATION_PRESET_DESCRIPTIONS[preset]}
          </Text>

          <Stepper
            label="Number of cards"
            value={cardCount}
            min={5}
            max={60}
            step={5}
            formatValue={(v) => `${v} cards`}
            onChange={setCardCount}
          />

          <Text style={{ fontSize: 13, fontWeight: '600', color: theme.text, marginTop: spacing.md, marginBottom: spacing.sm }}>
            Card types
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {CARD_TYPES.map((type) => (
              <Chip key={type} label={CARD_TYPE_LABELS[type]} active={cardTypes.includes(type)} onPress={() => toggleCardType(type)} />
            ))}
          </View>

          <Text style={{ fontSize: 13, fontWeight: '600', color: theme.text, marginTop: spacing.md, marginBottom: spacing.sm }}>
            Difficulty
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {DIFFICULTIES.map((d) => (
              <Chip key={d} label={d[0]!.toUpperCase() + d.slice(1)} active={difficulty === d} onPress={() => setDifficulty(d)} />
            ))}
          </View>

          <View style={{ marginTop: spacing.md }}>
            <SelectField
              label="Put the new cards in"
              hint="Auto-categorize reuses matching names"
              value={categoryTarget}
              onChange={setCategoryTarget}
              options={[
                { value: AUTO_CATEGORY, label: 'Auto-categorize from the document' },
                { value: NO_CATEGORY, label: 'No category' },
                ...deck.categories.map((cat) => ({ value: cat.id, label: `${cat.icon} ${cat.name}` })),
              ]}
            />
          </View>

          <Field
            label="Custom instructions"
            hint="optional"
            multiline
            numberOfLines={2}
            value={instructions}
            onChangeText={setInstructions}
            placeholder="e.g. Only cover chapter 5; the deck already has chapters 1–4."
          />

          <View style={{ marginTop: spacing.sm }}>
            <SwitchRow label="Include hints" value={includeHints} onValueChange={setIncludeHints} />
            <SwitchRow label="Include explanations" value={includeExplanations} onValueChange={setIncludeExplanations} />
            <SwitchRow
              label="Quote source passages"
              description="Show the original text each card was based on"
              value={includeSourceQuotes}
              onValueChange={setIncludeSourceQuotes}
            />
            <SwitchRow
              label="Read the pictures too"
              description="Reads diagrams and charts as well as the text. Slower and costs more."
              value={readImages}
              onValueChange={setReadImages}
            />
          </View>

          <Text style={{ fontSize: 12, color: theme.textFaint, marginTop: spacing.md }}>{formatQuota(quota)}</Text>
        </View>
      )}
    </Modal>
  );
}

function assignCategory(cards: GeneratedCard[], target: string): GeneratedCard[] {
  if (target === AUTO_CATEGORY) return cards;
  const categoryId = target === NO_CATEGORY ? undefined : target;
  return cards.map((card) => ({ ...card, categoryId }));
}
