import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { router } from 'expo-router';
import {
  CARD_TYPES,
  DECK_SOURCE_KINDS,
  DEFAULT_DECK_SOURCE_KIND,
  DEFAULT_GENERATION_PRESET,
  DEFAULT_MODEL_ID,
  DIFFICULTIES,
  DOCUMENT_KIND_ICONS,
  GENERATION_PRESETS,
  GenerationAbortedError,
  LOCALE_LABELS,
  MAX_DECK_SOURCES,
  MAX_PASTED_TEXT_CHARS,
  MAX_TOPIC_CHARS,
  MIN_PASTED_TEXT_CHARS,
  PLAN_LIMITS,
  SUPPORTED_FORMATS_LABEL,
  SUPPORTED_IMAGE_FORMATS_LABEL,
  SUPPORTED_LOCALES,
  UploadQuotaExceededError,
  canCreateDeck,
  createId,
  describeOversized,
  describeUnsupported,
  documentFromText,
  documentKindOf,
  formatFileSize,
  isOversizedUpload,
  isQuizletShareUrl,
  isSupportedDocument,
  isUsablePastedText,
  isUsableTopic,
  normalizeTopic,
  oversizedDocuments,
  parseQuizletExport,
  QuizletImportError,
  resolvePreset,
  titleFromFilename,
  type CardType,
  type DeckSourceKind,
  type Difficulty,
  type ExtractedDocument,
  type GeneratedCard,
  type GenerationPresetId,
  type GenerationProgress,
  type Locale,
} from '@autocards/core';
import { useApp } from '../../../src/lib/appContext';
import { useLocale, useT } from '../../../src/lib/i18n';
import { documentSourceFromUri } from '../../../src/lib/pdfSource';
import { toast } from '../../../src/lib/toastStore';
import { useTheme, spacing } from '../../../src/lib/theme';
import { formatQuota, useUploadQuota } from '../../../src/lib/useUploadQuota';
import {
  Button,
  Card,
  Chip,
  Field,
  Notice,
  ProgressBar,
  Screen,
  SelectField,
  Stepper,
  SwitchRow,
} from '../../../src/components';

type Step = 'idle' | 'generating' | 'error';
/** Deck cards come from uploads, or the deck starts empty and is filled in by hand. */
type Mode = 'ai' | 'manual';

/** A picked or captured file, adapted to what `documentSourceFromUri` needs. */
interface MobileFile {
  uri: string;
  name: string;
  size: number;
}

/**
 * One thing the deck will be written from — mirrors the web's `DeckSource`
 * (`apps/web/src/features/decks/CreateDeckPage.tsx`) so both clients build
 * decks out of the same pieces.
 */
type DeckSource =
  | { id: string; kind: 'upload'; file: MobileFile }
  | { id: string; kind: 'topic'; topic: string }
  | { id: string; kind: 'paste'; text: string }
  | { id: string; kind: 'quizlet'; cards: GeneratedCard[]; title?: string };

/** The icon beside each source in the list. */
const SOURCE_ICONS: Record<DeckSourceKind, string> = {
  upload: '📄',
  image: '🖼️',
  topic: '💡',
  paste: '📋',
  quizlet: '📇',
};

const IMAGE_EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/**
 * Turns a picked or captured photo into the shape the rest of the picker
 * deals in. The name is built from the mime type rather than trusted from the
 * asset: a library pick can report a `.heic` name for a file the picker
 * actually returned as a JPEG, and a camera shot has no filename at all.
 */
async function mobileFileFromImageAsset(asset: ImagePicker.ImagePickerAsset, index: number): Promise<MobileFile> {
  const extension = IMAGE_EXTENSION_BY_MIME[asset.mimeType ?? ''] ?? 'jpg';
  const name = `photo-${Date.now()}-${index}.${extension}`;
  let size = asset.fileSize ?? 0;
  if (!size) {
    const info = await FileSystem.getInfoAsync(asset.uri);
    size = info.exists ? info.size : 0;
  }
  return { uri: asset.uri, name, size };
}

export default function CreateDeckScreen() {
  const app = useApp();
  const t = useT();
  const appLocale = useLocale();
  const theme = useTheme();
  const user = app.authStore((s) => s.session?.user);
  const userId = user?.id;
  const plan = user?.plan ?? 'free';
  const deckCount = app.deckStore((s) => s.decks.length);
  const hasDeckRoom = canCreateDeck(plan, deckCount);
  const quota = useUploadQuota();
  const defaults = app.settingsStore((s) => s.generationDefaults);
  const updateDefaults = app.settingsStore((s) => s.updateGenerationDefaults);
  const createDeckFromGeneration = app.deckStore((s) => s.createDeckFromGeneration);
  const createBlankDeck = app.deckStore((s) => s.createBlankDeck);
  const addGeneratedCards = app.deckStore((s) => s.addGeneratedCards);
  const updateDeck = app.deckStore((s) => s.updateDeck);

  const [mode, setMode] = useState<Mode>('ai');
  const [step, setStep] = useState<Step>('idle');
  /** Everything the deck will be written from, in the order it was added. */
  const [sources, setSources] = useState<DeckSource[]>([]);
  /** The kind being filled in right now, or `null` once it has been added. */
  const [composer, setComposer] = useState<DeckSourceKind | null>(DEFAULT_DECK_SOURCE_KIND);
  const [topicDraft, setTopicDraft] = useState('');
  const [pasteDraft, setPasteDraft] = useState('');
  const [quizletUrl, setQuizletUrl] = useState('');
  const [quizletBusy, setQuizletBusy] = useState(false);
  const [quizletError, setQuizletError] = useState('');
  const [quizletPasting, setQuizletPasting] = useState(false);
  const [quizletDraft, setQuizletDraft] = useState('');
  const [progress, setProgress] = useState<GenerationProgress | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  // Shared by both tabs: the deck is named by the person making it either
  // way, so switching between them should not lose what has already been
  // typed, and it never gets hidden once a source has been picked.
  const [title, setTitle] = useState('');
  const [titleEdited, setTitleEdited] = useState(false);
  const [description, setDescription] = useState('');

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

  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  /** What the first source would name the deck, if nobody names it themselves. */
  function suggestedTitle(source: DeckSource | undefined): string {
    if (!source) return '';
    if (source.kind === 'upload') return titleFromFilename(source.file.name);
    if (source.kind === 'topic') return source.topic;
    if (source.kind === 'quizlet') return source.title ?? t('createDeck.quizletSourceName');
    return t('createDeck.pastedTextFilename');
  }

  /**
   * The name in the box: the first source's, until someone types their own.
   * Derived rather than written into state on every change, exactly like the
   * web version, so the name field always shows something sensible and never
   * appears to lose what was typed when a source is added or removed.
   */
  const deckTitle = titleEdited ? title : suggestedTitle(sources[0]);

  function editTitle(value: string) {
    setTitle(value);
    setTitleEdited(value.trim().length > 0);
  }

  const roomForSources = MAX_DECK_SOURCES - sources.length;
  const pasteDraftLength = pasteDraft.trim().length;
  const quizletDraftCards = parseQuizletExport(quizletDraft);

  /** Files land as one source each, so any one of them can be taken back out. */
  function addUploads(files: MobileFile[]) {
    if (files.length === 0) return;
    const added = files.slice(0, roomForSources);
    if (added.length === 0) return;
    setSources((prev) => [
      ...prev,
      ...added.map((file) => ({ id: createId('source'), kind: 'upload' as const, file })),
    ]);
    setComposer(null);
  }

  async function pickDocuments() {
    if (roomForSources <= 0) return;
    const result = await DocumentPicker.getDocumentAsync({ type: '*/*', multiple: true });
    if (result.canceled || !result.assets?.length) return;

    const accepted: MobileFile[] = [];
    for (const asset of result.assets) {
      const size = asset.size ?? 0;
      if (!isSupportedDocument(asset.name)) {
        toast({ variant: 'error', title: t('uploadDropzone.cannotReadTitle'), description: describeUnsupported(asset.name) });
        continue;
      }
      if (isOversizedUpload(size)) {
        toast({ variant: 'error', title: t('uploadDropzone.tooBigTitle'), description: describeOversized(asset.name, size) });
        continue;
      }
      accepted.push({ uri: asset.uri, name: asset.name, size });
    }
    addUploads(accepted);
  }

  async function addImageAssets(assets: ImagePicker.ImagePickerAsset[]) {
    const picked = assets.slice(0, roomForSources);
    const files: MobileFile[] = [];
    for (const [index, asset] of picked.entries()) {
      const file = await mobileFileFromImageAsset(asset, index);
      if (isOversizedUpload(file.size)) {
        toast({ variant: 'error', title: t('uploadDropzone.tooBigTitle'), description: describeOversized(file.name, file.size) });
        continue;
      }
      files.push(file);
    }
    addUploads(files);
  }

  async function choosePhoto() {
    if (roomForSources <= 0) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      toast({
        variant: 'error',
        title: t('mobileCreateDeck.permissionNeededTitle'),
        description: t('mobileCreateDeck.photoPermissionDenied'),
      });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsMultipleSelection: true,
      selectionLimit: roomForSources,
      quality: 0.9,
    });
    if (result.canceled || !result.assets?.length) return;
    await addImageAssets(result.assets);
  }

  async function takePhoto() {
    if (roomForSources <= 0) return;
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      toast({
        variant: 'error',
        title: t('mobileCreateDeck.permissionNeededTitle'),
        description: t('mobileCreateDeck.cameraPermissionDenied'),
      });
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.9 });
    if (result.canceled || !result.assets?.length) return;
    await addImageAssets(result.assets);
  }

  function addTopic() {
    if (!isUsableTopic(topicDraft) || roomForSources <= 0) return;
    setSources((prev) => [...prev, { id: createId('source'), kind: 'topic', topic: normalizeTopic(topicDraft) }]);
    setTopicDraft('');
    setComposer(null);
  }

  function addPastedText() {
    if (!isUsablePastedText(pasteDraft) || roomForSources <= 0) return;
    setSources((prev) => [...prev, { id: createId('source'), kind: 'paste', text: pasteDraft.trim() }]);
    setPasteDraft('');
    setComposer(null);
  }

  function addQuizletCards(cards: GeneratedCard[], quizTitle?: string) {
    setSources((prev) => [
      ...prev,
      { id: createId('source'), kind: 'quizlet', cards, ...(quizTitle ? { title: quizTitle } : {}) },
    ]);
    setQuizletUrl('');
    setQuizletDraft('');
    setQuizletError('');
    setQuizletPasting(false);
    setComposer(null);
  }

  async function fetchQuizletSet() {
    const importer = app.services.quizlet;
    if (!importer || quizletBusy || roomForSources <= 0) return;
    if (!isQuizletShareUrl(quizletUrl)) {
      setQuizletError(t('createDeck.quizletNotShareLink'));
      return;
    }

    setQuizletBusy(true);
    setQuizletError('');
    try {
      const set = await importer.importSet(quizletUrl);
      addQuizletCards(set.cards, set.title);
    } catch (err) {
      setQuizletError(err instanceof QuizletImportError ? err.message : t('createDeck.quizletFetchFailed'));
      setQuizletPasting(true);
    } finally {
      setQuizletBusy(false);
    }
  }

  function addPastedQuizletSet() {
    if (quizletDraftCards.length === 0 || roomForSources <= 0) return;
    addQuizletCards(quizletDraftCards);
  }

  function removeSource(id: string) {
    const next = sources.filter((source) => source.id !== id);
    setSources(next);
    if (next.length === 0) setComposer(DEFAULT_DECK_SOURCE_KIND);
  }

  const hasMaterial = sources.length > 0;
  const allFromTopics = hasMaterial && sources.every((source) => source.kind === 'topic');
  const needsGeneration = sources.some((source) => source.kind !== 'quizlet');
  const importedCards = sources.flatMap((source) => (source.kind === 'quizlet' ? source.cards : []));

  /** One row in the list of what the deck is being written from. */
  function describeSource(source: DeckSource): { icon: string; name: string; detail: string } {
    if (source.kind === 'upload') {
      return {
        icon: DOCUMENT_KIND_ICONS[documentKindOf(source.file.name) ?? 'pdf'],
        name: source.file.name,
        detail: formatFileSize(source.file.size),
      };
    }
    if (source.kind === 'topic') {
      return { icon: SOURCE_ICONS.topic, name: source.topic, detail: t('createDeck.topicSourceNote') };
    }
    if (source.kind === 'quizlet') {
      return {
        icon: SOURCE_ICONS.quizlet,
        name: source.title ?? t('createDeck.quizletSourceName'),
        detail: t.plural('createDeck.quizletSourceNote', source.cards.length, { count: source.cards.length }),
      };
    }
    return {
      icon: SOURCE_ICONS.paste,
      name: t('createDeck.pastedTextFilename'),
      detail: t.plural('createDeck.pastedTextSourceNote', source.text.length, { count: source.text.length }),
    };
  }

  function toggleCardType(type: CardType) {
    setCardTypes((prev) => {
      if (prev.includes(type)) {
        if (prev.length === 1) return prev;
        return prev.filter((entry) => entry !== type);
      }
      return [...prev, type];
    });
  }

  function choosePreset(next: GenerationPresetId) {
    setPreset(next);
    setCardTypes(resolvePreset(next).suggestedCardTypes);
  }

  async function startGeneration() {
    if (!hasMaterial || !userId || !hasDeckRoom) return;
    if (needsGeneration && !quota.canUpload) return;

    if (!needsGeneration) {
      const deck = createBlankDeck(userId, deckTitle.trim() || t('createDeck.quizletSourceName'));
      const { added } = addGeneratedCards(deck.id, importedCards);
      updateDeck(deck.id, {
        description:
          description.trim() ||
          t.plural('createDeck.importedDescription', added.length, { count: added.length }),
      });
      toast({
        variant: 'success',
        title: t('createDeck.deckCreatedTitle'),
        description: t.plural('createDeck.deckCreatedDescription', added.length, { count: added.length }),
      });
      router.replace(`/(app)/decks/${deck.id}`);
      return;
    }

    setStep('generating');
    setErrorMessage('');
    updateDefaults({ preset, cardCount, cardTypes, difficulty, autoCategories, includeHints, includeExplanations, includeSourceQuotes, readImages });

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const documents: ExtractedDocument[] = [];
      const topics: string[] = [];
      let pasteCount = 0;
      for (const source of sources) {
        if (source.kind === 'topic') {
          topics.push(source.topic);
        } else if (source.kind === 'paste') {
          pasteCount += 1;
          const name = t('createDeck.pastedTextFilename');
          documents.push(documentFromText(source.text, pasteCount > 1 ? `${name} ${pasteCount}` : name));
        } else if (source.kind === 'upload') {
          documents.push(
            await app.services.documents.extract(
              documentSourceFromUri(source.file.uri, source.file.name, source.file.size),
            ),
          );
        }
      }
      const tooLong = oversizedDocuments(plan, documents);
      if (tooLong.length > 0) {
        const names = tooLong.map((document) => document.filename).join(', ');
        throw new Error(
          t.plural('createDeck.documentTooLong', tooLong.length, {
            names,
            maxPages: PLAN_LIMITS[plan].maxPagesPerPdf,
          }),
        );
      }

      const result = await app.services.llm.generateDeck({
        documents,
        topics,
        signal: controller.signal,
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
        onProgress: setProgress,
      });
      const deck = createDeckFromGeneration(result, userId, { title: deckTitle, description });
      const imported = importedCards.length > 0 ? addGeneratedCards(deck.id, importedCards).added.length : 0;
      quota.record(result.quota);
      const total = result.cards.length + imported;
      toast({
        variant: 'success',
        title: t('createDeck.deckCreatedTitle'),
        description: t.plural('createDeck.deckCreatedDescription', total, { count: total }),
      });
      router.replace(`/(app)/decks/${deck.id}`);
    } catch (err) {
      if (err instanceof GenerationAbortedError) {
        setStep('idle');
        return;
      }
      if (err instanceof UploadQuotaExceededError && err.quota) quota.record(err.quota);
      setErrorMessage(err instanceof Error ? err.message : t('createDeck.genericError'));
      setStep('error');
    } finally {
      abortRef.current = null;
    }
  }

  function cancelGeneration() {
    abortRef.current?.abort();
  }

  function createManualDeck() {
    const name = deckTitle.trim();
    if (!name || !userId || !hasDeckRoom) return;
    const deck = createBlankDeck(userId, name);
    if (description.trim()) updateDeck(deck.id, { description: description.trim() });
    router.replace(`/(app)/decks/${deck.id}`);
  }

  function tryAgain() {
    setErrorMessage('');
    setStep('idle');
  }

  return (
    <Screen>
      <Text style={{ fontSize: 24, fontWeight: '800', color: theme.text }}>{t('createDeck.title')}</Text>
      <Text style={{ fontSize: 14, color: theme.textMuted, marginTop: 4, marginBottom: spacing.lg }}>
        {mode === 'manual' ? t('createDeck.subtitleManual') : t('createDeck.subtitleAi')}
      </Text>

      {step === 'idle' && (
        <View style={{ flexDirection: 'row', marginBottom: spacing.lg }}>
          <Chip label={t('createDeck.tab.ai')} active={mode === 'ai'} onPress={() => setMode('ai')} />
          <Chip label={t('createDeck.tab.manual')} active={mode === 'manual'} onPress={() => setMode('manual')} />
        </View>
      )}

      {step === 'idle' && !hasDeckRoom && (
        <View style={{ marginBottom: spacing.lg }}>
          <Notice variant="warning">{t('createDeck.deckLimitReached', { count: PLAN_LIMITS[plan].maxDecks })}</Notice>
        </View>
      )}

      {step === 'error' && (
        <Card style={{ alignItems: 'center', paddingVertical: spacing.xxl }}>
          <Text style={{ fontSize: 32 }}>⚠️</Text>
          <Text style={{ fontWeight: '700', color: theme.text, marginTop: spacing.md }}>{t('createDeck.generationFailed')}</Text>
          <Text style={{ color: theme.textMuted, fontSize: 13, marginTop: 4, textAlign: 'center' }}>{errorMessage}</Text>
          <Button title={t('createDeck.tryAgain')} onPress={tryAgain} style={{ marginTop: spacing.lg }} />
        </Card>
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
          <Text style={{ fontSize: 12, color: theme.textFaint, marginTop: spacing.lg, textAlign: 'center' }}>
            {allFromTopics ? t('createDeck.generatingHintTopic') : t('createDeck.generatingHint')}
          </Text>
          <Button title={t('createDeck.cancel')} variant="ghost" onPress={cancelGeneration} style={{ marginTop: spacing.md }} />
        </Card>
      )}

      {step === 'idle' && mode === 'manual' && (
        <Card>
          <Field
            label={t('createDeck.deckName')}
            placeholder={t('createDeck.deckNamePlaceholder')}
            value={deckTitle}
            onChangeText={editTitle}
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
          <Button title={t('createDeck.createEmptyDeck')} onPress={createManualDeck} size="lg" disabled={!deckTitle.trim() || !hasDeckRoom} />
        </Card>
      )}

      {step === 'idle' && mode === 'ai' && (
        <View>
          {!quota.canUpload && needsGeneration && (
            <View style={{ marginBottom: spacing.lg }}>
              <Notice variant="warning">{t('createDeck.quotaUsedUp', { limit: quota.limit })}</Notice>
            </View>
          )}

          <Card style={{ marginBottom: spacing.lg }}>
            {sources.length > 0 && (
              <View style={{ marginBottom: spacing.md }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: theme.text, marginBottom: spacing.sm }}>
                  {t('createDeck.sourcesHeading')}
                </Text>
                {sources.map((source) => {
                  const summary = describeSource(source);
                  return (
                    <View
                      key={source.id}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        borderWidth: 1,
                        borderColor: theme.border,
                        borderRadius: 12,
                        padding: spacing.sm,
                        marginBottom: spacing.sm,
                      }}
                    >
                      <Text style={{ fontSize: 20, marginRight: spacing.sm }}>{summary.icon}</Text>
                      <View style={{ flex: 1, marginRight: spacing.sm }}>
                        <Text style={{ fontWeight: '600', color: theme.text }} numberOfLines={1}>
                          {summary.name}
                        </Text>
                        <Text style={{ fontSize: 12, color: theme.textFaint }} numberOfLines={1}>
                          {summary.detail}
                        </Text>
                      </View>
                      <Button title={t('uploadDropzone.remove')} variant="ghost" size="sm" onPress={() => removeSource(source.id)} />
                    </View>
                  );
                })}
              </View>
            )}

            {composer !== null && (
              <View>
                <SelectField
                  label={t('createDeck.sourceLabel')}
                  value={composer}
                  onChange={(value) => setComposer(value as DeckSourceKind)}
                  options={DECK_SOURCE_KINDS.filter((kind) => kind !== 'quizlet' || app.services.quizlet !== null).map((kind) => ({
                    value: kind,
                    label: `${SOURCE_ICONS[kind]}  ${t(`createDeck.source.${kind}` as const)}`,
                  }))}
                />

                {/* Picking a file or a photo is itself the confirmation, so
                    these two need no add button of their own — they land in
                    the list and the picker folds away. */}
                {composer === 'upload' && (
                  <View style={{ alignItems: 'center', paddingVertical: spacing.lg }}>
                    <Text style={{ fontSize: 32 }}>📄</Text>
                    <Text
                      style={{ fontSize: 12, color: theme.textMuted, marginTop: spacing.sm, marginBottom: spacing.md, textAlign: 'center' }}
                    >
                      {t('createDeck.uploadHint', { formats: SUPPORTED_FORMATS_LABEL })}
                    </Text>
                    <Button title={t('mobileCreateDeck.browseDocuments')} onPress={pickDocuments} />
                  </View>
                )}

                {composer === 'image' && (
                  <View style={{ alignItems: 'center', paddingVertical: spacing.lg }}>
                    <Text style={{ fontSize: 32 }}>🖼️</Text>
                    <Text
                      style={{ fontSize: 12, color: theme.textMuted, marginTop: spacing.sm, marginBottom: spacing.md, textAlign: 'center' }}
                    >
                      {t('createDeck.imageUploadHint', { formats: SUPPORTED_IMAGE_FORMATS_LABEL })}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                      <Button title={t('mobileCreateDeck.takePhoto')} onPress={takePhoto} />
                      <Button title={t('mobileCreateDeck.choosePhoto')} variant="outline" onPress={choosePhoto} />
                    </View>
                  </View>
                )}

                {composer === 'topic' && (
                  <View style={{ marginTop: spacing.sm }}>
                    <Field
                      label={t('createDeck.topic')}
                      maxLength={MAX_TOPIC_CHARS}
                      placeholder={t('createDeck.topicPlaceholder')}
                      value={topicDraft}
                      onChangeText={setTopicDraft}
                    />
                    <Text style={{ fontSize: 12, color: theme.textMuted, marginTop: -spacing.sm, marginBottom: spacing.sm }}>
                      {t('createDeck.topicHint')}
                    </Text>
                  </View>
                )}

                {composer === 'paste' && (
                  <View style={{ marginTop: spacing.sm }}>
                    <Field
                      label={t('createDeck.pastedText')}
                      multiline
                      numberOfLines={8}
                      maxLength={MAX_PASTED_TEXT_CHARS}
                      placeholder={t('createDeck.pastedTextPlaceholder')}
                      value={pasteDraft}
                      onChangeText={setPasteDraft}
                      style={{ minHeight: 140, textAlignVertical: 'top' }}
                    />
                    <Text style={{ fontSize: 12, color: theme.textMuted, marginTop: -spacing.sm, marginBottom: spacing.sm }}>
                      {pasteDraftLength === 0
                        ? t('createDeck.pastedTextHint')
                        : pasteDraftLength < MIN_PASTED_TEXT_CHARS
                          ? t('createDeck.pastedTextTooShort', { count: MIN_PASTED_TEXT_CHARS - pasteDraftLength })
                          : t('createDeck.pastedTextReady', { count: pasteDraftLength })}
                    </Text>
                  </View>
                )}

                {composer === 'quizlet' && (
                  <View style={{ marginTop: spacing.sm }}>
                    <Field
                      label={t('createDeck.quizlet')}
                      autoCapitalize="none"
                      keyboardType="url"
                      placeholder={t('createDeck.quizletPlaceholder')}
                      value={quizletUrl}
                      onChangeText={(value) => {
                        setQuizletUrl(value);
                        setQuizletError('');
                      }}
                    />
                    <Text style={{ fontSize: 12, color: theme.textMuted, marginTop: -spacing.sm, marginBottom: spacing.sm }}>
                      {t('createDeck.quizletHint')}
                    </Text>
                    <Button
                      title={quizletBusy ? t('createDeck.fetchingQuizletSet') : t('createDeck.fetchQuizletSet')}
                      loading={quizletBusy}
                      disabled={quizletBusy || !quizletUrl.trim()}
                      onPress={fetchQuizletSet}
                    />

                    {quizletError && (
                      <View style={{ marginTop: spacing.md }}>
                        <Notice variant="warning">{quizletError}</Notice>
                      </View>
                    )}

                    {quizletPasting && (
                      <View style={{ marginTop: spacing.md }}>
                        <Field
                          label={t('createDeck.quizletExport')}
                          multiline
                          numberOfLines={8}
                          maxLength={MAX_PASTED_TEXT_CHARS}
                          placeholder={t('createDeck.quizletExportPlaceholder')}
                          value={quizletDraft}
                          onChangeText={setQuizletDraft}
                          style={{ minHeight: 120, textAlignVertical: 'top' }}
                        />
                        <Text style={{ fontSize: 12, color: theme.textMuted, marginTop: -spacing.sm, marginBottom: spacing.sm }}>
                          {quizletDraftCards.length > 0
                            ? t.plural('createDeck.quizletFound', quizletDraftCards.length, { count: quizletDraftCards.length })
                            : quizletDraft.trim()
                              ? t('createDeck.quizletNothingFound')
                              : t('createDeck.quizletPasteFallback')}
                        </Text>
                        <Button
                          title={t('createDeck.addQuizletSource')}
                          disabled={quizletDraftCards.length === 0}
                          onPress={addPastedQuizletSet}
                        />
                      </View>
                    )}
                  </View>
                )}

                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.sm }}>
                  {sources.length > 0 && (
                    <Button title={t('createDeck.cancel')} variant="ghost" onPress={() => setComposer(null)} />
                  )}
                  {composer === 'topic' && (
                    <Button title={t('createDeck.addTopicSource')} disabled={!isUsableTopic(topicDraft)} onPress={addTopic} />
                  )}
                  {composer === 'paste' && (
                    <Button title={t('createDeck.addPastedTextSource')} disabled={!isUsablePastedText(pasteDraft)} onPress={addPastedText} />
                  )}
                </View>
              </View>
            )}

            {composer === null &&
              (roomForSources > 0 ? (
                <Button title={`+ ${t('createDeck.addAnotherSource')}`} variant="outline" onPress={() => setComposer(DEFAULT_DECK_SOURCE_KIND)} />
              ) : (
                <Text style={{ fontSize: 13, color: theme.textMuted }}>{t('createDeck.sourceFull')}</Text>
              ))}
          </Card>

          <Card style={{ marginBottom: spacing.lg }}>
            <Field
              label={t('createDeck.deckName')}
              hint={t('common.optional')}
              placeholder={t('createDeck.deckNamePlaceholder')}
              value={deckTitle}
              onChangeText={editTitle}
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

          {needsGeneration && (
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
          )}

          {needsGeneration && (
            <Text style={{ fontSize: 12, color: theme.textFaint, marginBottom: spacing.sm, textAlign: 'right' }}>
              {formatQuota(t, quota)}
            </Text>
          )}
          <Button
            title={needsGeneration ? t('createDeck.generateFlashcards') : t('createDeck.createFromImport')}
            onPress={startGeneration}
            size="lg"
            disabled={!hasMaterial || !hasDeckRoom || (needsGeneration && !quota.canUpload)}
          />
        </View>
      )}
    </Screen>
  );
}
