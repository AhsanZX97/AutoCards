import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  documentFromText,
  documentKindOf,
  formatFileSize,
  QuizletImportError,
  isQuizletShareUrl,
  isUsablePastedText,
  isUsableTopic,
  normalizeTopic,
  oversizedDocuments,
  parseQuizletExport,
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
import { useApp } from '../../lib/appContext';
import { useLocale, useT } from '../../lib/i18n';
import { cn } from '../../lib/cn';
import { Button, Card, CardBody, Chip, Field, FormNotice, InfoButton, Input, Modal, Progress, Select, Slider, Switch, Tabs, Textarea } from '../../components/ui';
import { toast } from '../../components/ui/toastStore';
import { formatQuota, useUploadQuota } from '../../lib/useUploadQuota';
import { PlanLimitNotice } from '../billing/PlanLimitNotice';
import { UploadDropzone } from './UploadDropzone';

type Step = 'idle' | 'generating' | 'error';
/** Deck cards come from uploads, or the deck starts empty and is filled in by hand. */
type Mode = 'ai' | 'manual';

/**
 * One thing the deck will be written from, as it sits on the page before
 * anything is extracted or sent.
 *
 * A deck is rarely one thing. The slides, the handout, and the two subjects
 * the lecturer skipped are four pieces of the same revision, and asking
 * someone to choose between them means either a worse deck or four decks. So
 * each piece is added on its own and they generate together.
 */
type DeckSource =
  | { id: string; kind: 'upload'; file: File }
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

export function CreateDeckPage() {
  const app = useApp();
  const t = useT();
  const appLocale = useLocale();
  const navigate = useNavigate();
  const MODE_TABS = [
    { id: 'ai', label: t('createDeck.tab.ai'), icon: '✨' },
    { id: 'manual', label: t('createDeck.tab.manual'), icon: '✏️' },
  ];

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
  /**
   * The kind being filled in right now, or `null` once it has been added and
   * the picker has folded away again. Open on an upload to begin with, because
   * with nothing added yet there is nothing else for the page to show.
   */
  const [composer, setComposer] = useState<DeckSourceKind | null>(DEFAULT_DECK_SOURCE_KIND);
  const [topicDraft, setTopicDraft] = useState('');
  const [pasteDraft, setPasteDraft] = useState('');
  const [quizletUrl, setQuizletUrl] = useState('');
  const [quizletBusy, setQuizletBusy] = useState(false);
  const [quizletError, setQuizletError] = useState('');
  // Only offered once fetching has actually failed. It is the slower route,
  // and putting it on screen from the start invites people down it needlessly.
  const [quizletPasting, setQuizletPasting] = useState(false);
  const [quizletDraft, setQuizletDraft] = useState('');
  const [progress, setProgress] = useState<GenerationProgress | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  // Shared by both tabs: the deck is named by the person making it either way,
  // so switching between them should not lose what has already been typed.
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
  const [typeHelpOpen, setTypeHelpOpen] = useState(false);
  // Defaults to the app's own language; picking a different one here only
  // affects this generation, not the app-wide setting.
  const [language, setLanguage] = useState<Locale>(appLocale);

  const abortRef = useRef<AbortController | null>(null);

  // Navigating away otherwise leaves the request running and the progress
  // ticker calling setState on an unmounted page.
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
   *
   * Derived rather than written into state on every change, so removing the
   * first source renames the deck after whatever is now first — and emptying
   * the box by hand hands naming back to the sources rather than leaving a
   * deck called nothing.
   */
  const deckTitle = titleEdited ? title : suggestedTitle(sources[0]);

  function editTitle(value: string) {
    setTitle(value);
    setTitleEdited(value.trim().length > 0);
  }

  const uploadedFiles = sources.flatMap((source) => (source.kind === 'upload' ? [source.file] : []));
  const roomForSources = MAX_DECK_SOURCES - sources.length;
  const pasteDraftLength = pasteDraft.trim().length;
  // Parsed as it is typed, so the count under the box is the answer to "did
  // that work" rather than something only the Add button finds out.
  const quizletDraftCards = parseQuizletExport(quizletDraft);

  /** Files land as one source each, so any one of them can be taken back out. */
  function addUploads(next: File[]) {
    const added = next.slice(uploadedFiles.length, uploadedFiles.length + roomForSources);
    if (added.length === 0) return;
    setSources((prev) => [
      ...prev,
      ...added.map((file) => ({ id: createId('source'), kind: 'upload' as const, file })),
    ]);
    setComposer(null);
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

  function addQuizletCards(cards: GeneratedCard[], title?: string) {
    setSources((prev) => [
      ...prev,
      { id: createId('source'), kind: 'quizlet', cards, ...(title ? { title } : {}) },
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
      // Quizlet refusing the request is the expected failure, not a broken
      // app, so the offer to paste the cards in appears with the message.
      setQuizletError(
        err instanceof QuizletImportError ? err.message : t('createDeck.quizletFetchFailed'),
      );
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
    // Nothing left means an empty page with a lone "add" button on it, so the
    // picker comes back by itself rather than making that a second step.
    if (next.length === 0) setComposer(DEFAULT_DECK_SOURCE_KIND);
  }

  const hasMaterial = sources.length > 0;
  /** No file and no paste in the mix — the whole deck comes out of the model. */
  const allFromTopics = hasMaterial && sources.every((source) => source.kind === 'topic');
  /**
   * Whether anything here needs a model at all. An imported set is already
   * cards, so a deck made only of imports skips generation entirely — no wait,
   * and nothing taken off the monthly allowance.
   */
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
        if (prev.length === 1) return prev; // keep at least one
        return prev.filter((t) => t !== type);
      }
      return [...prev, type];
    });
  }

  /**
   * Card types follow the preset, because the wrong ones quietly ruin it — a
   * true/false card about an interview answer is a quiz about the job advert.
   * The chips stay editable afterwards for anyone who disagrees.
   */
  function choosePreset(next: GenerationPresetId) {
    setPreset(next);
    setCardTypes(resolvePreset(next).suggestedCardTypes);
  }

  async function startGeneration() {
    if (!hasMaterial || !userId || !hasDeckRoom) return;
    if (needsGeneration && !quota.canUpload) return;

    // An import is already cards, so a deck made only of imports is built
    // here and now — no model, no waiting screen, no allowance spent.
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
      navigate(`/app/decks/${deck.id}`);
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
          // Nothing to extract — the text is already the document. It still
          // goes through the same shape as an upload so the deck records where
          // its cards came from the way every other deck does. Numbered only
          // once there is more than one, so the common case reads plainly.
          pasteCount += 1;
          const name = t('createDeck.pastedTextFilename');
          documents.push(documentFromText(source.text, pasteCount > 1 ? `${name} ${pasteCount}` : name));
        } else if (source.kind === 'upload') {
          // Sequential rather than parallel: pdf.js pins a worker per document
          // and several large files at once is what makes the tab stutter.
          documents.push(await app.services.documents.extract(source.file));
        }
        // An imported set is already cards. It never goes near the model —
        // it is appended to the deck once the generated cards are in.
      }
      // Checked before the model runs, so an upload that is too long for the
      // plan costs nothing to discover.
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
          // Model choice is not a decision to put in front of a student, so the
          // page always runs on the house default rather than exposing a picker.
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
      // Appended rather than sent up with the rest: these are already finished
      // cards, and running them past the model would only risk it rewriting
      // them. `addGeneratedCards` drops any that repeat what it just wrote.
      const imported = importedCards.length > 0 ? addGeneratedCards(deck.id, importedCards).added.length : 0;
      // Spent on the way out rather than the way in: a run that never reached
      // the model — a bad key, an unreadable file — costs nothing to fix.
      // The server counts it too, and its number wins where it sent one.
      quota.record(result.quota);
      const total = result.cards.length + imported;
      toast({
        variant: 'success',
        title: t('createDeck.deckCreatedTitle'),
        description: t.plural('createDeck.deckCreatedDescription', total, { count: total }),
      });
      navigate(`/app/decks/${deck.id}`);
    } catch (err) {
      // Cancelling is a choice, not a failure — back to the form, no error
      // screen, and the files still selected so it can be started again.
      if (err instanceof GenerationAbortedError) {
        setStep('idle');
        return;
      }
      // Being turned away is itself news about the allowance: the meter was
      // showing uploads left or the button would have been disabled.
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
    // No upload, no model call — so this never touches the upload quota.
    const deck = createBlankDeck(userId, name);
    if (description.trim()) updateDeck(deck.id, { description: description.trim() });
    toast({
      variant: 'success',
      title: t('createDeck.deckCreatedTitle'),
      description: t('createDeck.blankDeckCreatedDescription'),
    });
    navigate(`/app/decks/${deck.id}`);
  }

  function tryAgain() {
    setErrorMessage('');
    setStep('idle');
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">{t('createDeck.title')}</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {mode === 'manual' ? t('createDeck.subtitleManual') : t('createDeck.subtitleAi')}
        </p>
      </div>

      {step === 'idle' && <Tabs items={MODE_TABS} active={mode} onChange={(id) => setMode(id as Mode)} />}

      {step === 'idle' && !hasDeckRoom && (
        <PlanLimitNotice message={t('createDeck.deckLimitReached', { count: PLAN_LIMITS[plan].maxDecks })} />
      )}

      {step === 'error' && (
        <Card>
          <CardBody className="flex flex-col items-center py-14 text-center">
            <span className="text-4xl">⚠️</span>
            <p className="mt-4 font-semibold text-slate-800 dark:text-slate-200">{t('createDeck.generationFailed')}</p>
            <p className="mt-1 max-w-sm text-sm text-slate-400">{errorMessage}</p>
            <Button className="mt-6" onClick={tryAgain}>
              {t('createDeck.tryAgain')}
            </Button>
          </CardBody>
        </Card>
      )}

      {step === 'generating' && (
        <Card>
          <CardBody className="flex flex-col items-center py-14 text-center">
            <div className="relative flex h-20 w-20 items-center justify-center">
              <img src="/favicon.svg" alt="" className="h-12 w-12 animate-pulse rounded-lg" />
            </div>
            <p className="mt-4 font-semibold text-slate-800 dark:text-slate-200">
              {progress ? t(`generationStage.${progress.stage}` as const) : t('createDeck.gettingStarted')}
            </p>
            {progress && <p className="mt-1 text-sm text-slate-400">{progress.message}</p>}
            <Progress value={progress?.progress ?? 0} className="mt-6 w-full max-w-xs" />
            <p className="mt-6 text-xs text-slate-400">
              {allFromTopics ? t('createDeck.generatingHintTopic') : t('createDeck.generatingHint')}
            </p>
            <Button variant="ghost" className="mt-4" onClick={cancelGeneration}>
              {t('createDeck.cancel')}
            </Button>
          </CardBody>
        </Card>
      )}

      {step === 'idle' && mode === 'manual' && (
        <Card>
          <CardBody className="space-y-6">
            <Field label={t('createDeck.deckName')}>
              <Input
                autoFocus
                placeholder={t('createDeck.deckNamePlaceholder')}
                value={deckTitle}
                onChange={(e) => editTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') createManualDeck();
                }}
              />
            </Field>
            <Field label={t('createDeck.description')} hint={t('common.optional')}>
              <Textarea
                rows={2}
                placeholder={t('createDeck.descriptionPlaceholder')}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </Field>
            <div className="flex items-center justify-end">
              <Button size="lg" disabled={!deckTitle.trim() || !hasDeckRoom} onClick={createManualDeck}>
                {t('createDeck.createEmptyDeck')}
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {step === 'idle' && mode === 'ai' && (
        <div className="space-y-6">
          {!quota.canUpload && needsGeneration && (
            <PlanLimitNotice message={t('createDeck.quotaUsedUp', { limit: quota.limit })} />
          )}
          <Card>
            <CardBody className="space-y-5">
              {sources.length > 0 && (
                <div>
                  <p className="mb-2.5 text-sm font-medium text-slate-700 dark:text-slate-300">
                    {t('createDeck.sourcesHeading')}
                  </p>
                  <ul className="space-y-2">
                    {sources.map((source) => {
                      const summary = describeSource(source);
                      return (
                        <li
                          key={source.id}
                          className="flex items-center gap-3 rounded-2xl border border-slate-200 p-3 dark:border-slate-800"
                        >
                          <span className="text-xl">{summary.icon}</span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">
                              {summary.name}
                            </p>
                            <p className="truncate text-xs text-slate-400">{summary.detail}</p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={t('createDeck.removeSource', { name: summary.name })}
                            onClick={() => removeSource(source.id)}
                          >
                            {t('uploadDropzone.remove')}
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {composer !== null && (
                <div
                  className={cn(
                    'space-y-4',
                    sources.length > 0 && 'border-t border-slate-100 pt-5 dark:border-slate-800',
                  )}
                >
                  <Field label={t('createDeck.sourceLabel')}>
                    <Select value={composer} onChange={(e) => setComposer(e.target.value as DeckSourceKind)}>
                      {DECK_SOURCE_KINDS.filter(
                        (kind) => kind !== 'quizlet' || app.services.quizlet !== null,
                      ).map((kind) => (
                        <option key={kind} value={kind}>
                          {`${SOURCE_ICONS[kind]}  ${t(`createDeck.source.${kind}` as const)}`}
                        </option>
                      ))}
                    </Select>
                  </Field>

                  {/* Picking files is itself the confirmation, so an upload
                      needs no button of its own — it lands in the list and the
                      picker folds away. */}
                  {composer === 'upload' && (
                    <UploadDropzone
                      files={uploadedFiles}
                      showList={false}
                      onChange={addUploads}
                      hint={t('createDeck.uploadHint', { formats: SUPPORTED_FORMATS_LABEL })}
                    />
                  )}

                  {/* Pictures are picked apart from documents but land in the
                      same list: once chosen, a photo is an upload like any
                      other and the file limit counts them together. */}
                  {composer === 'image' && (
                    <UploadDropzone
                      variant="image"
                      files={uploadedFiles}
                      showList={false}
                      onChange={addUploads}
                      hint={t('createDeck.imageUploadHint', { formats: SUPPORTED_IMAGE_FORMATS_LABEL })}
                    />
                  )}

                  {composer === 'topic' && (
                    <Field label={t('createDeck.topic')}>
                      <Input
                        autoFocus
                        maxLength={MAX_TOPIC_CHARS}
                        placeholder={t('createDeck.topicPlaceholder')}
                        value={topicDraft}
                        onChange={(e) => setTopicDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') addTopic();
                        }}
                      />
                      <p className="mt-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                        {t('createDeck.topicHint')}
                      </p>
                    </Field>
                  )}

                  {composer === 'paste' && (
                    <Field label={t('createDeck.pastedText')}>
                      <Textarea
                        autoFocus
                        rows={10}
                        maxLength={MAX_PASTED_TEXT_CHARS}
                        placeholder={t('createDeck.pastedTextPlaceholder')}
                        value={pasteDraft}
                        onChange={(e) => setPasteDraft(e.target.value)}
                      />
                      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                        {pasteDraftLength === 0
                          ? t('createDeck.pastedTextHint')
                          : pasteDraftLength < MIN_PASTED_TEXT_CHARS
                            ? t('createDeck.pastedTextTooShort', {
                                count: MIN_PASTED_TEXT_CHARS - pasteDraftLength,
                              })
                            : t('createDeck.pastedTextReady', { count: pasteDraftLength })}
                      </p>
                    </Field>
                  )}

                  {composer === 'quizlet' && (
                    <div className="space-y-4">
                      <Field label={t('createDeck.quizlet')}>
                        <div className="flex gap-2">
                          <Input
                            autoFocus
                            type="url"
                            inputMode="url"
                            className="flex-1"
                            placeholder={t('createDeck.quizletPlaceholder')}
                            value={quizletUrl}
                            onChange={(e) => {
                              setQuizletUrl(e.target.value);
                              setQuizletError('');
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') void fetchQuizletSet();
                            }}
                          />
                          <Button
                            loading={quizletBusy}
                            disabled={quizletBusy || !quizletUrl.trim()}
                            onClick={() => void fetchQuizletSet()}
                          >
                            {quizletBusy ? t('createDeck.fetchingQuizletSet') : t('createDeck.fetchQuizletSet')}
                          </Button>
                        </div>
                        <p className="mt-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                          {t('createDeck.quizletHint')}
                        </p>
                      </Field>

                      {quizletError && (
                        <FormNotice variant="error">
                          {quizletError}
                        </FormNotice>
                      )}

                      {/* The way round a refusal, shown only once there has
                          been one. The user's own browser is signed in and not
                          blocked, so copying the cards across always works. */}
                      {quizletPasting && (
                        <Field label={t('createDeck.quizletExport')}>
                          <Textarea
                            rows={8}
                            maxLength={MAX_PASTED_TEXT_CHARS}
                            placeholder={t('createDeck.quizletExportPlaceholder')}
                            value={quizletDraft}
                            onChange={(e) => setQuizletDraft(e.target.value)}
                          />
                          <p className="mt-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                            {quizletDraftCards.length > 0
                              ? t.plural('createDeck.quizletFound', quizletDraftCards.length, {
                                  count: quizletDraftCards.length,
                                })
                              : quizletDraft.trim()
                                ? t('createDeck.quizletNothingFound')
                                : t('createDeck.quizletPasteFallback')}
                          </p>
                        </Field>
                      )}
                    </div>
                  )}

                  {((composer !== 'upload' && composer !== 'image' && composer !== 'quizlet') ||
                    sources.length > 0 ||
                    quizletPasting) && (
                    <div className="flex items-center justify-end gap-2">
                      {sources.length > 0 && (
                        <Button variant="ghost" onClick={() => setComposer(null)}>
                          {t('createDeck.cancel')}
                        </Button>
                      )}
                      {composer === 'topic' && (
                        <Button disabled={!isUsableTopic(topicDraft)} onClick={addTopic}>
                          {t('createDeck.addTopicSource')}
                        </Button>
                      )}
                      {composer === 'paste' && (
                        <Button disabled={!isUsablePastedText(pasteDraft)} onClick={addPastedText}>
                          {t('createDeck.addPastedTextSource')}
                        </Button>
                      )}
                      {composer === 'quizlet' && quizletPasting && (
                        <Button disabled={quizletDraftCards.length === 0} onClick={addPastedQuizletSet}>
                          {t('createDeck.addQuizletSource')}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {composer === null &&
                (roomForSources > 0 ? (
                  <Button variant="outline" onClick={() => setComposer(DEFAULT_DECK_SOURCE_KIND)}>
                    <span aria-hidden>+</span>
                    {t('createDeck.addAnotherSource')}
                  </Button>
                ) : (
                  <p className="text-sm text-slate-500 dark:text-slate-400">{t('createDeck.sourceFull')}</p>
                ))}
            </CardBody>
          </Card>

          <Card>
            <CardBody className="space-y-6">
              <Field label={t('createDeck.deckName')} hint={t('common.optional')}>
                <Input
                  placeholder={t('createDeck.deckNamePlaceholder')}
                  value={deckTitle}
                  onChange={(e) => editTitle(e.target.value)}
                />
              </Field>
              <Field label={t('createDeck.description')} hint={t('common.optional')}>
                <Textarea
                  rows={2}
                  placeholder={t('createDeck.descriptionPlaceholder')}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </Field>
            </CardBody>
          </Card>

          {needsGeneration && (
          <Card>
            <CardBody className="space-y-6">
              <h3 className="font-semibold text-slate-900 dark:text-white">{t('createDeck.generationOptions')}</h3>

              <Field label={t('createDeck.whatFor')} hint={t('createDeck.whatForHint')}>
                <div className="flex flex-wrap gap-2">
                  {GENERATION_PRESETS.map((id) => (
                    <Chip key={id} active={preset === id} onClick={() => choosePreset(id)}>
                      {t(`generationPreset.${id}` as const)}
                    </Chip>
                  ))}
                </div>
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                  {t(`generationPreset.${preset}.description` as const)}
                </p>
              </Field>

              <Slider
                label={t('createDeck.numberOfCards')}
                value={cardCount}
                min={5}
                max={60}
                step={5}
                onChange={setCardCount}
                formatValue={(v) => t('createDeck.cardsUnit', { count: v })}
              />

              <div>
                <div className="mb-2 flex items-center gap-1.5">
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('createDeck.cardTypesToInclude')}</p>
                  <InfoButton label={t('createDeck.cardTypesHelp')} onClick={() => setTypeHelpOpen(true)} />
                </div>
                <div className="flex flex-wrap gap-2">
                  {CARD_TYPES.map((type) => (
                    <Chip key={type} active={cardTypes.includes(type)} onClick={() => toggleCardType(type)}>
                      {t(`cardType.${type}` as const)}
                    </Chip>
                  ))}
                </div>
              </div>

              <Field label={t('createDeck.targetDifficulty')}>
                <div className="flex flex-wrap gap-2">
                  {DIFFICULTIES.map((d) => (
                    <Chip key={d} active={difficulty === d} onClick={() => setDifficulty(d)}>
                      {t(`difficulty.${d}` as const)}
                    </Chip>
                  ))}
                </div>
              </Field>

              <Field label={t('createDeck.customInstructions')} hint={t('common.optional')}>
                <Textarea
                  rows={2}
                  placeholder={t('createDeck.customInstructionsPlaceholder')}
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                />
              </Field>

              <Field label={t('createDeck.language')} hint={t('createDeck.languageHint')}>
                <Select value={language} onChange={(e) => setLanguage(e.target.value as Locale)}>
                  {SUPPORTED_LOCALES.map((locale) => (
                    <option key={locale} value={locale}>
                      {LOCALE_LABELS[locale]}
                    </option>
                  ))}
                </Select>
              </Field>

              <div className="space-y-1 border-t border-slate-100 pt-4 dark:border-slate-800">
                <Switch checked={autoCategories} onChange={setAutoCategories} label={t('createDeck.autoCategorize')} description={t('createDeck.autoCategorizeDescription')} />
                <Switch checked={includeHints} onChange={setIncludeHints} label={t('createDeck.includeHints')} description={t('createDeck.includeHintsDescription')} />
                <Switch checked={includeExplanations} onChange={setIncludeExplanations} label={t('createDeck.includeExplanations')} description={t('createDeck.includeExplanationsDescription')} />
                <Switch checked={includeSourceQuotes} onChange={setIncludeSourceQuotes} label={t('createDeck.quoteSource')} description={t('createDeck.quoteSourceDescription')} />
                <Switch
                  checked={readImages}
                  onChange={setReadImages}
                  label={t('createDeck.readImages')}
                  description={t('createDeck.readImagesDescription')}
                />
              </div>
            </CardBody>
          </Card>
          )}

          <div className="flex items-center justify-end gap-4">
            {needsGeneration && <span className="text-xs text-slate-400">{formatQuota(t, quota)}</span>}
            <Button
              size="lg"
              disabled={!hasMaterial || !hasDeckRoom || (needsGeneration && !quota.canUpload)}
              onClick={startGeneration}
            >
              {needsGeneration ? t('createDeck.generateFlashcards') : t('createDeck.createFromImport')}
            </Button>
          </div>
        </div>
      )}

      <Modal
        open={typeHelpOpen}
        onClose={() => setTypeHelpOpen(false)}
        title={t('createDeck.cardTypesModalTitle')}
        description={t('createDeck.cardTypesModalDescription')}
        size="md"
        footer={<Button onClick={() => setTypeHelpOpen(false)}>{t('createDeck.gotIt')}</Button>}
      >
        <dl className="space-y-3.5 text-sm">
          {CARD_TYPES.map((type) => (
            <div key={type}>
              <dt className="font-semibold text-slate-800 dark:text-slate-100">{t(`cardType.${type}` as const)}</dt>
              <dd className="mt-0.5 text-slate-600 dark:text-slate-400">{t(`cardType.${type}.description` as const)}</dd>
            </div>
          ))}
        </dl>
      </Modal>
    </div>
  );
}
