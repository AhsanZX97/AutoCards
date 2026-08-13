import { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
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
  SUPPORTED_FORMATS_LABEL,
  describeOversized,
  describeUnsupported,
  documentKindOf,
  isOversizedUpload,
  isSupportedDocument,
  resolvePreset,
  type CardType,
  type Difficulty,
  type GenerationPresetId,
  type GenerationProgress,
} from '@autocards/core';
import { useApp } from '../../../src/lib/appContext';
import { documentSourceFromUri } from '../../../src/lib/pdfSource';
import { toast } from '../../../src/lib/toastStore';
import { useTheme, spacing } from '../../../src/lib/theme';
import { Button, Card, Chip, Field, ProgressBar, Screen, Stepper, SwitchRow } from '../../../src/components';

type Step = 'upload' | 'configure' | 'generating' | 'error';

export default function CreateDeckScreen() {
  const app = useApp();
  const theme = useTheme();
  const userId = app.authStore((s) => s.session?.user.id);
  const defaults = app.settingsStore((s) => s.generationDefaults);
  const updateDefaults = app.settingsStore((s) => s.updateGenerationDefaults);
  const createDeckFromGeneration = app.deckStore((s) => s.createDeckFromGeneration);
  const createBlankDeck = app.deckStore((s) => s.createBlankDeck);
  const updateDeck = app.deckStore((s) => s.updateDeck);

  const [mode, setMode] = useState<'ai' | 'manual'>('ai');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<{ uri: string; name: string; size: number } | null>(null);
  const [progress, setProgress] = useState<GenerationProgress | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  const [preset, setPreset] = useState<GenerationPresetId>(defaults.preset ?? DEFAULT_GENERATION_PRESET);
  const [cardCount, setCardCount] = useState(defaults.cardCount);
  const [cardTypes, setCardTypes] = useState<CardType[]>(defaults.cardTypes);
  const [difficulty, setDifficulty] = useState<Difficulty>(defaults.difficulty);
  const [autoCategories, setAutoCategories] = useState(defaults.autoCategories);
  const [includeHints, setIncludeHints] = useState(defaults.includeHints);
  const [includeExplanations, setIncludeExplanations] = useState(defaults.includeExplanations);
  const [includeSourceQuotes, setIncludeSourceQuotes] = useState(defaults.includeSourceQuotes);
  const [readImages, setReadImages] = useState(defaults.readImages ?? false);
  const [instructions, setInstructions] = useState('');

  async function pickFile() {
    // '*/*' rather than a MIME allowlist: platforms disagree about what MIME
    // type a .docx or .md carries, same reasoning as the web picker's accept
    // list. Real filtering happens below, by extension.
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
    setStep('configure');
  }

  function removeFile() {
    setFile(null);
    setStep('upload');
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
    if (!file || !userId) return;
    setStep('generating');
    setErrorMessage('');
    updateDefaults({ preset, cardCount, cardTypes, difficulty, autoCategories, includeHints, includeExplanations, includeSourceQuotes, readImages });
    try {
      const source = documentSourceFromUri(file.uri, file.name, file.size);
      const document = await app.services.documents.extract(source);
      const result = await app.services.llm.generateDeck({
        documents: [document],
        options: {
          // Model choice is not a decision to put in front of a student, so
          // generation always runs on the house default rather than exposing a picker.
          model: DEFAULT_MODEL_ID,
          preset,
          cardCount,
          cardTypes,
          difficulty,
          autoCategories,
          instructions: instructions.trim() || undefined,
          includeHints,
          includeExplanations,
          includeSourceQuotes,
          readImages,
          language: 'en',
        },
        onProgress: setProgress,
      });
      const deck = createDeckFromGeneration(result, userId, { title, description });
      router.replace(`/(app)/decks/${deck.id}`);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Something went wrong generating your deck.');
      setStep('error');
    }
  }

  function createManualDeck() {
    const name = title.trim();
    if (!name || !userId) return;
    // No upload, no model call — so this never touches the upload quota.
    const deck = createBlankDeck(userId, name);
    if (description.trim()) updateDeck(deck.id, { description: description.trim() });
    router.replace(`/(app)/decks/${deck.id}`);
  }

  return (
    <Screen>
      <Text style={{ fontSize: 24, fontWeight: '800', color: theme.text }}>Create a deck</Text>
      <Text style={{ fontSize: 14, color: theme.textMuted, marginTop: 4, marginBottom: spacing.lg }}>
        {mode === 'ai'
          ? 'Upload your material and Auto Cards will write the flashcards for you.'
          : 'Start with an empty deck and write the cards yourself.'}
      </Text>

      {step === 'upload' && (
        <View>
          <View style={{ flexDirection: 'row', marginBottom: spacing.lg }}>
            <Chip label="Generate with AI" active={mode === 'ai'} onPress={() => setMode('ai')} />
            <Chip label="Start from scratch" active={mode === 'manual'} onPress={() => setMode('manual')} />
          </View>

          <Card style={{ marginBottom: spacing.lg }}>
            <Field
              label="Deck name"
              placeholder="e.g. Financial Accounting, Chapter 4"
              value={title}
              onChangeText={setTitle}
            />
            <Field
              label="Description"
              hint="optional"
              placeholder="What this deck covers…"
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={2}
            />
          </Card>

          {mode === 'manual' ? (
            <Button title="Create empty deck" onPress={createManualDeck} size="lg" disabled={!title.trim()} />
          ) : (
            <Card style={{ alignItems: 'center', paddingVertical: spacing.xxl }}>
              <Text style={{ fontSize: 40 }}>📄</Text>
              <Text style={{ fontWeight: '700', color: theme.text, marginTop: spacing.md, textAlign: 'center' }}>
                Choose a file to build flashcards from
              </Text>
              <Text style={{ fontSize: 12, color: theme.textMuted, marginTop: 4, textAlign: 'center' }}>
                Takes {SUPPORTED_FORMATS_LABEL}.
              </Text>
              <Button title="Browse files" onPress={pickFile} style={{ marginTop: spacing.lg }} />
            </Card>
          )}
        </View>
      )}

      {step === 'configure' && file && (
        <View>
          <Card style={{ marginBottom: spacing.lg }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ flex: 1, marginRight: spacing.md }}>
                <Text style={{ fontWeight: '700', color: theme.text }} numberOfLines={1}>
                  {DOCUMENT_KIND_ICONS[documentKindOf(file.name) ?? 'pdf']} {file.name}
                </Text>
                <Text style={{ fontSize: 12, color: theme.textFaint, marginTop: 2 }}>{Math.round(file.size / 1024)} KB</Text>
              </View>
              <Button title="Remove" variant="ghost" size="sm" onPress={removeFile} />
            </View>
          </Card>

          <Card style={{ marginBottom: spacing.lg }}>
            <Text style={{ fontWeight: '700', color: theme.text, marginBottom: spacing.md }}>Generation options</Text>

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
                <Chip
                  key={type}
                  label={CARD_TYPE_LABELS[type]}
                  active={cardTypes.includes(type)}
                  onPress={() => toggleCardType(type)}
                />
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
              <Field
                label="Custom instructions"
                hint="optional"
                placeholder="e.g. Focus on chapter 3, write cards for a final exam…"
                value={instructions}
                onChangeText={setInstructions}
                multiline
                numberOfLines={2}
              />
            </View>

            <View style={{ marginTop: spacing.md }}>
              <SwitchRow
                label="Auto-categorize"
                description="Group cards by topic"
                value={autoCategories}
                onValueChange={setAutoCategories}
              />
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
          </Card>

          <Button title="Generate flashcards" onPress={startGeneration} size="lg" />
        </View>
      )}

      {step === 'generating' && (
        <Card style={{ alignItems: 'center', paddingVertical: spacing.xxl }}>
          <ActivityIndicator color={theme.primary} size="large" />
          <Text style={{ fontWeight: '700', color: theme.text, marginTop: spacing.lg }}>
            {progress ? GENERATION_STAGE_LABELS[progress.stage] : 'Getting started…'}
          </Text>
          {progress && <Text style={{ color: theme.textFaint, fontSize: 13, marginTop: 4 }}>{progress.message}</Text>}
          <View style={{ width: '100%', marginTop: spacing.lg }}>
            <ProgressBar value={progress?.progress ?? 0} />
          </View>
        </Card>
      )}

      {step === 'error' && (
        <Card style={{ alignItems: 'center', paddingVertical: spacing.xxl }}>
          <Text style={{ fontSize: 32 }}>⚠️</Text>
          <Text style={{ fontWeight: '700', color: theme.text, marginTop: spacing.md }}>Generation failed</Text>
          <Text style={{ color: theme.textMuted, fontSize: 13, marginTop: 4, textAlign: 'center' }}>{errorMessage}</Text>
          <Button title="Try again" onPress={() => setStep('configure')} style={{ marginTop: spacing.lg }} />
        </Card>
      )}
    </Screen>
  );
}
