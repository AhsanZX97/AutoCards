import { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import {
  CARD_TYPES,
  DEFAULT_GENERATION_PRESET,
  DEFAULT_MODEL_ID,
  DIFFICULTIES,
  DOCUMENT_KIND_ICONS,
  GENERATION_PRESETS,
  LOCALE_LABELS,
  SUPPORTED_FORMATS_LABEL,
  SUPPORTED_LOCALES,
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
  type Locale,
} from '@autocards/core';
import { useApp } from '../../../src/lib/appContext';
import { useLocale, useT } from '../../../src/lib/i18n';
import { documentSourceFromUri } from '../../../src/lib/pdfSource';
import { toast } from '../../../src/lib/toastStore';
import { useTheme, spacing } from '../../../src/lib/theme';
import { Button, Card, Chip, Field, ProgressBar, Screen, SelectField, Stepper, SwitchRow } from '../../../src/components';

type Step = 'upload' | 'configure' | 'generating' | 'error';

export default function CreateDeckScreen() {
  const app = useApp();
  const t = useT();
  const appLocale = useLocale();
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
  const [language, setLanguage] = useState<Locale>(appLocale);

  async function pickFile() {
    // '*/*' rather than a MIME allowlist: platforms disagree about what MIME
    // type a .docx or .md carries, same reasoning as the web picker's accept
    // list. Real filtering happens below, by extension.
    const result = await DocumentPicker.getDocumentAsync({ type: '*/*' });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const size = asset.size ?? 0;

    if (!isSupportedDocument(asset.name)) {
      toast({ variant: 'error', title: t('uploadDropzone.cannotReadTitle'), description: describeUnsupported(asset.name) });
      return;
    }
    if (isOversizedUpload(size)) {
      toast({ variant: 'error', title: t('uploadDropzone.tooBigTitle'), description: describeOversized(asset.name, size) });
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
          language,
        },
        onProgress: setProgress,
      });
      const deck = createDeckFromGeneration(result, userId, { title, description });
      router.replace(`/(app)/decks/${deck.id}`);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : t('createDeck.genericError'));
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
      <Text style={{ fontSize: 24, fontWeight: '800', color: theme.text }}>{t('createDeck.title')}</Text>
      <Text style={{ fontSize: 14, color: theme.textMuted, marginTop: 4, marginBottom: spacing.lg }}>
        {mode === 'ai' ? t('createDeck.subtitleAi') : t('createDeck.subtitleManual')}
      </Text>

      {step === 'upload' && (
        <View>
          <View style={{ flexDirection: 'row', marginBottom: spacing.lg }}>
            <Chip label={t('createDeck.tab.ai')} active={mode === 'ai'} onPress={() => setMode('ai')} />
            <Chip label={t('createDeck.tab.manual')} active={mode === 'manual'} onPress={() => setMode('manual')} />
          </View>

          <Card style={{ marginBottom: spacing.lg }}>
            <Field
              label={t('createDeck.deckName')}
              placeholder={t('createDeck.deckNamePlaceholder')}
              value={title}
              onChangeText={setTitle}
            />
            <Field
              label={t('createDeck.description')}
              hint={t('common.optional')}
              placeholder={t('createDeck.descriptionPlaceholder')}
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={2}
            />
          </Card>

          {mode === 'manual' ? (
            <Button title={t('createDeck.createEmptyDeck')} onPress={createManualDeck} size="lg" disabled={!title.trim()} />
          ) : (
            <Card style={{ alignItems: 'center', paddingVertical: spacing.xxl }}>
              <Text style={{ fontSize: 40 }}>📄</Text>
              <Text style={{ fontWeight: '700', color: theme.text, marginTop: spacing.md, textAlign: 'center' }}>
                {t('mobileCreateDeck.chooseFile')}
              </Text>
              <Text style={{ fontSize: 12, color: theme.textMuted, marginTop: 4, textAlign: 'center' }}>
                {t('mobileGenerate.takesFormats', { formats: SUPPORTED_FORMATS_LABEL })}
              </Text>
              <Button title={t('mobileGenerate.browseFiles')} onPress={pickFile} style={{ marginTop: spacing.lg }} />
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
              <Button title={t('mobileCreateDeck.remove')} variant="ghost" size="sm" onPress={removeFile} />
            </View>
          </Card>

          <Card style={{ marginBottom: spacing.lg }}>
            <Text style={{ fontWeight: '700', color: theme.text, marginBottom: spacing.md }}>{t('createDeck.generationOptions')}</Text>

            <Text style={{ fontSize: 13, fontWeight: '600', color: theme.text, marginBottom: spacing.sm }}>
              {t('createDeck.whatFor')}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {GENERATION_PRESETS.map((id) => (
                <Chip key={id} label={t(`generationPreset.${id}` as const)} active={preset === id} onPress={() => choosePreset(id)} />
              ))}
            </View>
            <Text style={{ fontSize: 12, color: theme.textMuted, marginTop: -4, marginBottom: spacing.md }}>
              {t(`generationPreset.${preset}.description` as const)}
            </Text>

            <Stepper
              label={t('createDeck.numberOfCards')}
              value={cardCount}
              min={5}
              max={60}
              step={5}
              formatValue={(v) => t('createDeck.cardsUnit', { count: v })}
              onChange={setCardCount}
            />

            <Text style={{ fontSize: 13, fontWeight: '600', color: theme.text, marginTop: spacing.md, marginBottom: spacing.sm }}>
              {t('createDeck.cardTypesToInclude')}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {CARD_TYPES.map((type) => (
                <Chip
                  key={type}
                  label={t(`cardType.${type}` as const)}
                  active={cardTypes.includes(type)}
                  onPress={() => toggleCardType(type)}
                />
              ))}
            </View>

            <Text style={{ fontSize: 13, fontWeight: '600', color: theme.text, marginTop: spacing.md, marginBottom: spacing.sm }}>
              {t('createDeck.targetDifficulty')}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {DIFFICULTIES.map((d) => (
                <Chip key={d} label={t(`difficulty.${d}` as const)} active={difficulty === d} onPress={() => setDifficulty(d)} />
              ))}
            </View>

            <View style={{ marginTop: spacing.md }}>
              <Field
                label={t('createDeck.customInstructions')}
                hint={t('common.optional')}
                placeholder={t('createDeck.customInstructionsPlaceholder')}
                value={instructions}
                onChangeText={setInstructions}
                multiline
                numberOfLines={2}
              />
            </View>

            <View style={{ marginTop: spacing.md }}>
              <SelectField
                label={t('createDeck.language')}
                hint={t('createDeck.languageHint')}
                value={language}
                onChange={(value) => setLanguage(value as Locale)}
                options={SUPPORTED_LOCALES.map((locale) => ({ value: locale, label: LOCALE_LABELS[locale] }))}
              />
            </View>

            <View style={{ marginTop: spacing.md }}>
              <SwitchRow
                label={t('createDeck.autoCategorize')}
                description={t('mobileCreateDeck.autoCategorizeDescription')}
                value={autoCategories}
                onValueChange={setAutoCategories}
              />
              <SwitchRow label={t('createDeck.includeHints')} value={includeHints} onValueChange={setIncludeHints} />
              <SwitchRow label={t('createDeck.includeExplanations')} value={includeExplanations} onValueChange={setIncludeExplanations} />
              <SwitchRow
                label={t('createDeck.quoteSource')}
                description={t('createDeck.quoteSourceDescription')}
                value={includeSourceQuotes}
                onValueChange={setIncludeSourceQuotes}
              />
              <SwitchRow
                label={t('createDeck.readImages')}
                description={t('createDeck.readImagesDescription')}
                value={readImages}
                onValueChange={setReadImages}
              />
            </View>
          </Card>

          <Button title={t('createDeck.generateFlashcards')} onPress={startGeneration} size="lg" />
        </View>
      )}

      {step === 'generating' && (
        <Card style={{ alignItems: 'center', paddingVertical: spacing.xxl }}>
          <ActivityIndicator color={theme.primary} size="large" />
          <Text style={{ fontWeight: '700', color: theme.text, marginTop: spacing.lg }}>
            {progress ? t(`generationStage.${progress.stage}` as const) : t('createDeck.gettingStarted')}
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
          <Text style={{ fontWeight: '700', color: theme.text, marginTop: spacing.md }}>{t('createDeck.generationFailed')}</Text>
          <Text style={{ color: theme.textMuted, fontSize: 13, marginTop: 4, textAlign: 'center' }}>{errorMessage}</Text>
          <Button title={t('createDeck.tryAgain')} onPress={() => setStep('configure')} style={{ marginTop: spacing.lg }} />
        </Card>
      )}
    </Screen>
  );
}
