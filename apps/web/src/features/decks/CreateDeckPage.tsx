import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CARD_TYPES,
  DEFAULT_GENERATION_PRESET,
  DEFAULT_MODEL_ID,
  DIFFICULTIES,
  GENERATION_PRESETS,
  GenerationAbortedError,
  LOCALE_LABELS,
  PLAN_LIMITS,
  SUPPORTED_FORMATS_LABEL,
  SUPPORTED_LOCALES,
  UploadQuotaExceededError,
  canCreateDeck,
  oversizedDocuments,
  resolvePreset,
  titleFromFilename,
  type CardType,
  type Difficulty,
  type GenerationPresetId,
  type GenerationProgress,
  type Locale,
} from '@autocards/core';
import { useApp } from '../../lib/appContext';
import { useLocale, useT } from '../../lib/i18n';
import { Button, Card, CardBody, Chip, Field, InfoButton, Input, Modal, Progress, Select, Slider, Switch, Tabs, Textarea } from '../../components/ui';
import { toast } from '../../components/ui/toastStore';
import { formatQuota, useUploadQuota } from '../../lib/useUploadQuota';
import { PlanLimitNotice } from '../billing/PlanLimitNotice';
import { UploadDropzone } from './UploadDropzone';

type Step = 'idle' | 'generating' | 'error';
/** Deck cards come from uploads, or the deck starts empty and is filled in by hand. */
type Mode = 'ai' | 'manual';

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
  const updateDeck = app.deckStore((s) => s.updateDeck);

  const [mode, setMode] = useState<Mode>('ai');
  const [step, setStep] = useState<Step>('idle');
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState<GenerationProgress | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  // Shared by both tabs: the deck is named by the person making it either way,
  // so switching between them should not lose what has already been typed.
  const [title, setTitle] = useState('');
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

  /**
   * Names the deck after the first file as soon as it lands, rather than
   * waiting until generation, so the field never sits blank while there is
   * already a name to give it. Only when nothing has been typed yet — a name
   * the user chose or a name we already filled in is never overwritten.
   */
  function handleFilesChange(next: File[]) {
    if (!title.trim() && files.length === 0 && next.length > 0) {
      setTitle(titleFromFilename((next[0] as File).name));
    }
    setFiles(next);
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
    if (files.length === 0 || !userId || !quota.canUpload || !hasDeckRoom) return;
    setStep('generating');
    setErrorMessage('');

    updateDefaults({ preset, cardCount, cardTypes, difficulty, autoCategories, includeHints, includeExplanations, includeSourceQuotes, readImages });

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      // Sequential rather than parallel: pdf.js pins a worker per document and
      // several large files at once is what makes the tab stutter.
      const documents = [];
      for (const selected of files) {
        documents.push(await app.services.documents.extract(selected));
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
      const deck = createDeckFromGeneration(result, userId, { title, description });
      // Spent on the way out rather than the way in: a run that never reached
      // the model — a bad key, an unreadable file — costs nothing to fix.
      // The server counts it too, and its number wins where it sent one.
      quota.record(result.quota);
      toast({
        variant: 'success',
        title: t('createDeck.deckCreatedTitle'),
        description: t.plural('createDeck.deckCreatedDescription', result.cards.length, { count: result.cards.length }),
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
    const name = title.trim();
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
          {mode === 'ai' ? t('createDeck.subtitleAi') : t('createDeck.subtitleManual')}
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
            <p className="mt-6 text-xs text-slate-400">{t('createDeck.generatingHint')}</p>
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
                value={title}
                onChange={(e) => setTitle(e.target.value)}
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
              <Button size="lg" disabled={!title.trim() || !hasDeckRoom} onClick={createManualDeck}>
                {t('createDeck.createEmptyDeck')}
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {step === 'idle' && mode === 'ai' && (
        <div className="space-y-6">
          {!quota.canUpload && (
            <PlanLimitNotice message={t('createDeck.quotaUsedUp', { limit: quota.limit })} />
          )}
          <Card>
            <CardBody className="space-y-6">
              <Field label={t('createDeck.deckName')}>
                <Input
                  autoFocus
                  placeholder={t('createDeck.deckNamePlaceholder')}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
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

          <Card>
            <CardBody>
              <UploadDropzone
                files={files}
                onChange={handleFilesChange}
                hint={t('createDeck.uploadHint', { formats: SUPPORTED_FORMATS_LABEL })}
              />
            </CardBody>
          </Card>

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

          <div className="flex items-center justify-end gap-4">
            <span className="text-xs text-slate-400">{formatQuota(t, quota)}</span>
            <Button
              size="lg"
              disabled={files.length === 0 || !quota.canUpload || !hasDeckRoom}
              onClick={startGeneration}
            >
              {t('createDeck.generateFlashcards')}
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
