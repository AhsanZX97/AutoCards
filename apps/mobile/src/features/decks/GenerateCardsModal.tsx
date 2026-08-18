import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import {
  CARD_TYPES,
  DEFAULT_GENERATION_PRESET,
  DEFAULT_MODEL_ID,
  DIFFICULTIES,
  DOCUMENT_KIND_ICONS,
  GENERATION_PRESETS,
  GenerationAbortedError,
  LOCALE_LABELS,
  SUPPORTED_FORMATS_LABEL,
  SUPPORTED_LOCALES,
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
  type Locale,
} from '@autocards/core';
import { useApp } from '../../lib/appContext';
import { useLocale, useT } from '../../lib/i18n';
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
  const t = useT();
  const appLocale = useLocale();
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
  const [language, setLanguage] = useState<Locale>(appLocale);

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
      toast({ variant: 'error', title: t('uploadDropzone.cannotReadTitle'), description: describeUnsupported(asset.name) });
      return;
    }
    if (isOversizedUpload(size)) {
      toast({ variant: 'error', title: t('uploadDropzone.tooBigTitle'), description: describeOversized(asset.name, size) });
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
          language,
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
        setErrorMessage(t('addCards.allDuplicates'));
        setStep('error');
        return;
      }

      toast({
        variant: 'success',
        title: t.plural('addCards.cardsAdded', added.length, { count: added.length }),
        description:
          duplicates > 0 ? t.plural('addCards.duplicatesSkipped', duplicates, { count: duplicates }) : undefined,
      });
      onClose();
    } catch (err) {
      if (err instanceof GenerationAbortedError) {
        setStep('setup');
        return;
      }
      if (err instanceof UploadQuotaExceededError && err.quota) quota.record(err.quota);
      setErrorMessage(err instanceof Error ? err.message : t('addCards.genericError'));
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
      title={t('addCards.title')}
      description={t('addCards.description', { count: cards.length, deckTitle: deck.title })}
      footer={
        step === 'setup' ? (
          <>
            <Button title={t('addCards.cancel')} variant="ghost" onPress={onClose} style={{ flex: 1 }} />
            <Button
              title={t('addCards.generate')}
              onPress={startGeneration}
              disabled={!file || !quota.canUpload}
              style={{ flex: 1 }}
            />
          </>
        ) : step === 'error' ? (
          <>
            <Button title={t('addCards.close')} variant="ghost" onPress={onClose} style={{ flex: 1 }} />
            <Button title={t('addCards.tryAgain')} onPress={() => setStep('setup')} style={{ flex: 1 }} />
          </>
        ) : (
          <Button title={t('addCards.cancelGeneration')} variant="ghost" onPress={cancelGeneration} style={{ flex: 1 }} />
        )
      }
    >
      {step === 'generating' && (
        <View style={{ alignItems: 'center', paddingVertical: spacing.xxl }}>
          <ActivityIndicator color={theme.primary} size="large" />
          <Text style={{ fontWeight: '700', color: theme.text, marginTop: spacing.lg }}>
            {progress ? t(`generationStage.${progress.stage}` as const) : t('addCards.gettingStarted')}
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
          <Text style={{ fontWeight: '700', color: theme.text, marginTop: spacing.md }}>{t('addCards.noneAddedTitle')}</Text>
          <Text style={{ color: theme.textMuted, fontSize: 13, marginTop: 4, textAlign: 'center' }}>{errorMessage}</Text>
        </View>
      )}

      {step === 'setup' && (
        <View>
          {!quota.canUpload && (
            <View style={{ marginBottom: spacing.md }}>
              <Notice variant="warning">{t('addCards.quotaUsedUp', { limit: quota.limit })}</Notice>
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
                <Button title={t('mobileGenerate.change')} variant="ghost" size="sm" onPress={pickFile} />
              </View>
            ) : (
              <View style={{ alignItems: 'center', paddingVertical: spacing.lg }}>
                <Text style={{ fontSize: 32 }}>📄</Text>
                <Text style={{ fontWeight: '700', color: theme.text, marginTop: spacing.sm, textAlign: 'center' }}>
                  {t('mobileGenerate.chooseDocument')}
                </Text>
                <Text style={{ fontSize: 12, color: theme.textMuted, marginTop: 4, textAlign: 'center' }}>
                  {t('mobileGenerate.takesFormats', { formats: SUPPORTED_FORMATS_LABEL })}
                </Text>
                <Button title={t('mobileGenerate.browseFiles')} onPress={pickFile} style={{ marginTop: spacing.md }} />
              </View>
            )}
          </Card>

          <Text style={{ fontSize: 13, fontWeight: '600', color: theme.text, marginBottom: spacing.sm }}>
            {t('addCards.whatFor')}
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
            label={t('addCards.numberOfCards')}
            value={cardCount}
            min={5}
            max={60}
            step={5}
            formatValue={(v) => t('createDeck.cardsUnit', { count: v })}
            onChange={setCardCount}
          />

          <Text style={{ fontSize: 13, fontWeight: '600', color: theme.text, marginTop: spacing.md, marginBottom: spacing.sm }}>
            {t('addCards.cardTypesToInclude')}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {CARD_TYPES.map((type) => (
              <Chip key={type} label={t(`cardType.${type}` as const)} active={cardTypes.includes(type)} onPress={() => toggleCardType(type)} />
            ))}
          </View>

          <Text style={{ fontSize: 13, fontWeight: '600', color: theme.text, marginTop: spacing.md, marginBottom: spacing.sm }}>
            {t('addCards.targetDifficulty')}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {DIFFICULTIES.map((d) => (
              <Chip key={d} label={t(`difficulty.${d}` as const)} active={difficulty === d} onPress={() => setDifficulty(d)} />
            ))}
          </View>

          <View style={{ marginTop: spacing.md }}>
            <SelectField
              label={t('addCards.putNewCardsIn')}
              hint={t('addCards.putNewCardsInHint')}
              value={categoryTarget}
              onChange={setCategoryTarget}
              options={[
                { value: AUTO_CATEGORY, label: t('addCards.autoCategorizeOption') },
                { value: NO_CATEGORY, label: t('addCards.noCategoryOption') },
                ...deck.categories.map((cat) => ({ value: cat.id, label: `${cat.icon} ${cat.name}` })),
              ]}
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

          <Field
            label={t('addCards.customInstructions')}
            hint={t('common.optional')}
            multiline
            numberOfLines={2}
            value={instructions}
            onChangeText={setInstructions}
            placeholder={t('addCards.customInstructionsPlaceholder')}
          />

          <View style={{ marginTop: spacing.sm }}>
            <SwitchRow label={t('addCards.includeHints')} value={includeHints} onValueChange={setIncludeHints} />
            <SwitchRow label={t('addCards.includeExplanations')} value={includeExplanations} onValueChange={setIncludeExplanations} />
            <SwitchRow
              label={t('addCards.quoteSource')}
              description={t('addCards.quoteSourceDescription')}
              value={includeSourceQuotes}
              onValueChange={setIncludeSourceQuotes}
            />
            <SwitchRow
              label={t('addCards.readImages')}
              description={t('addCards.readImagesDescription')}
              value={readImages}
              onValueChange={setReadImages}
            />
          </View>

          <Text style={{ fontSize: 12, color: theme.textFaint, marginTop: spacing.md }}>{formatQuota(t, quota)}</Text>
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
