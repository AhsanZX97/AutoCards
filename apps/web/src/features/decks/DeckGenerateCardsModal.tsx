import { useEffect, useRef, useState } from 'react';
import {
  CARD_TYPE_LABELS,
  CARD_TYPES,
  DEFAULT_GENERATION_PRESET,
  DEFAULT_MODEL_ID,
  DIFFICULTIES,
  GENERATION_PRESET_DESCRIPTIONS,
  GENERATION_PRESET_LABELS,
  GENERATION_PRESETS,
  GENERATION_STAGE_LABELS,
  GenerationAbortedError,
  PLAN_LIMITS,
  SUPPORTED_FORMATS_LABEL,
  UploadQuotaExceededError,
  oversizedDocuments,
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
import { Button, Chip, Field, Modal, Progress, Select, Slider, Switch, Textarea } from '../../components/ui';
import { toast } from '../../components/ui/toastStore';
import { getPromptText } from '../../lib/cardText';
import { formatQuota, useUploadQuota } from '../../lib/useUploadQuota';
import { PlanLimitNotice } from '../billing/PlanLimitNotice';
import { UploadDropzone } from './UploadDropzone';

/** Sentinels for the category picker, alongside the deck's real category ids. */
const AUTO_CATEGORY = '__auto__';
const NO_CATEGORY = '__none__';

type Step = 'setup' | 'generating' | 'error';

interface DeckGenerateCardsModalProps {
  open: boolean;
  onClose: () => void;
  deck: Deck;
  /** Cards already in the deck — what the new batch must not repeat. */
  cards: Flashcard[];
}

/**
 * Adds cards to a deck that already exists, from more uploaded material.
 *
 * Same pipeline as creating a deck (extract → generate → normalize) and the
 * same allowance is spent, so the options offered here are the generation
 * options minus the ones that only make sense while naming a new deck. Two
 * things are different: the model is shown what the deck already asks, and
 * whatever comes back is de-duplicated against it on the way in.
 */
export function DeckGenerateCardsModal({ open, onClose, deck, cards }: DeckGenerateCardsModalProps) {
  const app = useApp();
  const quota = useUploadQuota();

  const plan = app.authStore((s) => s.session?.user.plan) ?? 'free';
  const defaults = app.settingsStore((s) => s.generationDefaults);
  const updateDefaults = app.settingsStore((s) => s.updateGenerationDefaults);
  const addGeneratedCards = app.deckStore((s) => s.addGeneratedCards);
  const abortRef = useRef<AbortController | null>(null);

  const [step, setStep] = useState<Step>('setup');
  const [files, setFiles] = useState<File[]>([]);
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

  // Reopening after a failed or finished run should start clean rather than on
  // the last run's error screen.
  useEffect(() => {
    if (!open) return;
    setStep('setup');
    setFiles([]);
    setProgress(null);
    setErrorMessage('');
  }, [open]);

  // A run outlives this modal otherwise: the request keeps going and the
  // progress ticker keeps calling setState on something no longer mounted.
  useEffect(() => () => abortRef.current?.abort(), []);

  function toggleCardType(type: CardType) {
    setCardTypes((prev) => {
      if (prev.includes(type)) {
        if (prev.length === 1) return prev; // keep at least one
        return prev.filter((t) => t !== type);
      }
      return [...prev, type];
    });
  }

  /** Card types follow the preset — see `CreateDeckPage` for why. */
  function choosePreset(next: GenerationPresetId) {
    setPreset(next);
    setCardTypes(resolvePreset(next).suggestedCardTypes);
  }

  async function startGeneration() {
    if (files.length === 0 || !quota.canUpload) return;
    const autoCategories = categoryTarget === AUTO_CATEGORY;

    setStep('generating');
    setErrorMessage('');
    updateDefaults({ preset, cardCount, cardTypes, difficulty, includeHints, includeExplanations, includeSourceQuotes, readImages });

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      // Sequential — see `CreateDeckPage`.
      const documents = [];
      for (const selected of files) {
        documents.push(await app.services.documents.extract(selected));
      }

      // The same check deck creation makes. Without it this path was a way
      // around the plan's page limit, and the only one that spent an upload
      // doing it.
      const tooLong = oversizedDocuments(plan, documents);
      if (tooLong.length > 0) {
        const names = tooLong.map((document) => document.filename).join(', ');
        throw new Error(
          `${names} ${tooLong.length === 1 ? 'is' : 'are'} longer than the ${PLAN_LIMITS[plan].maxPagesPerPdf} pages your plan reads in one document. Split it up, or move to a bigger plan.`,
        );
      }

      const result = await app.services.llm.generateDeck({
        signal: controller.signal,
        documents,
        options: {
          // Fixed house model — see `CreateDeckPage`; picking one is not a
          // decision to put in front of a student.
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
        // Telling the model what the deck already covers is cheaper than paying
        // for repeats and discarding them — though `addGeneratedCards` still
        // de-duplicates whatever comes back.
        avoidPrompts: cards.map((card) => getPromptText(card)).filter(Boolean),
        onProgress: setProgress,
      });

      const { added, duplicates } = addGeneratedCards(
        deck.id,
        assignCategory(result.cards, categoryTarget),
        autoCategories ? result.categories : [],
      );
      // The upload happened and was billed by OpenRouter whatever came back, so
      // it is spent even when every card turned out to be a repeat. The server
      // counted it too, and its number wins where it sent one.
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
        description:
          duplicates > 0
            ? `${duplicates} duplicate${duplicates === 1 ? ' was' : 's were'} skipped.`
            : undefined,
      });
      onClose();
    } catch (err) {
      // Cancelling is a choice, not a failure — back to the form, no error.
      if (err instanceof GenerationAbortedError) {
        setStep('setup');
        return;
      }
      // Being turned away is itself news about the allowance: the meter was
      // showing uploads left or the button would have been disabled.
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
      size="lg"
      footer={
        step === 'setup' ? (
          <>
            <span className="mr-auto text-xs text-slate-400">{formatQuota(quota)}</span>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={startGeneration} disabled={files.length === 0 || !quota.canUpload}>
              Generate cards
            </Button>
          </>
        ) : step === 'error' ? (
          <>
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
            <Button onClick={() => setStep('setup')}>Try again</Button>
          </>
        ) : (
          <Button variant="ghost" onClick={cancelGeneration}>
            Cancel generation
          </Button>
        )
      }
    >
      {step === 'generating' && (
        <div className="flex flex-col items-center py-10 text-center">
          <img src="/favicon.svg" alt="" className="mx-auto h-12 w-12 animate-pulse rounded-lg" />
          <p className="mt-4 font-semibold text-slate-800 dark:text-slate-200">
            {progress ? GENERATION_STAGE_LABELS[progress.stage] : 'Getting started…'}
          </p>
          {progress && <p className="mt-1 text-sm text-slate-400">{progress.message}</p>}
          <Progress value={progress?.progress ?? 0} className="mt-6 w-full max-w-xs" />
          <p className="mt-6 text-xs text-slate-400">Reading your files and writing cards. This takes a minute.</p>
        </div>
      )}

      {step === 'error' && (
        <div className="flex flex-col items-center py-10 text-center">
          <span className="text-4xl">⚠️</span>
          <p className="mt-4 font-semibold text-slate-800 dark:text-slate-200">No cards were added</p>
          <p className="mt-1 max-w-sm text-sm text-slate-400">{errorMessage}</p>
        </div>
      )}

      {step === 'setup' && (
        <div className="space-y-5">
          {!quota.canUpload && (
            <PlanLimitNotice
              message={`You have used all ${quota.limit} of this month’s generations. Your allowance resets on the 1st. Until then you can still write cards yourself.`}
            />
          )}

          <UploadDropzone
            compact
            files={files}
            onChange={setFiles}
            hint={`Another chapter, a past paper, a set of slides. Takes ${SUPPORTED_FORMATS_LABEL}.`}
          />

          <Field label="What are these cards for?" hint="Sets the card types to match">
            <div className="flex flex-wrap gap-2">
              {GENERATION_PRESETS.map((id) => (
                <Chip key={id} active={preset === id} onClick={() => choosePreset(id)}>
                  {GENERATION_PRESET_LABELS[id]}
                </Chip>
              ))}
            </div>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              {GENERATION_PRESET_DESCRIPTIONS[preset]}
            </p>
          </Field>

          <Slider
            label="Number of cards"
            value={cardCount}
            min={5}
            max={60}
            step={5}
            onChange={setCardCount}
            formatValue={(v) => `${v} cards`}
          />

          <div>
            <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">Card types to include</p>
            <div className="flex flex-wrap gap-2">
              {CARD_TYPES.map((type) => (
                <Chip key={type} active={cardTypes.includes(type)} onClick={() => toggleCardType(type)}>
                  {CARD_TYPE_LABELS[type]}
                </Chip>
              ))}
            </div>
          </div>

          <Field label="Target difficulty">
            <div className="flex flex-wrap gap-2">
              {DIFFICULTIES.map((d) => (
                <Chip key={d} active={difficulty === d} onClick={() => setDifficulty(d)}>
                  {d[0]?.toUpperCase() + d.slice(1)}
                </Chip>
              ))}
            </div>
          </Field>

          <Field label="Put the new cards in" hint="Auto-categorize reuses this deck’s categories where the names match">
            <Select value={categoryTarget} onChange={(e) => setCategoryTarget(e.target.value)}>
              <option value={AUTO_CATEGORY}>Auto-categorize from the document</option>
              <option value={NO_CATEGORY}>No category</option>
              {deck.categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.icon} {cat.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Custom instructions" hint="optional">
            <Textarea
              rows={2}
              placeholder="e.g. Only cover chapter 5; the deck already has chapters 1–4."
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
            />
          </Field>

          <div className="space-y-1 border-t border-slate-100 pt-4 dark:border-slate-800">
            <Switch checked={includeHints} onChange={setIncludeHints} label="Include hints" description="Add a hint to harder cards" />
            <Switch
              checked={includeExplanations}
              onChange={setIncludeExplanations}
              label="Include explanations"
              description="Explain why the answer is correct"
            />
            <Switch
              checked={includeSourceQuotes}
              onChange={setIncludeSourceQuotes}
              label="Quote source passages"
              description="Show the original text each card was based on"
            />
            <Switch
              checked={readImages}
              onChange={setReadImages}
              label="Read the pictures too"
              description="Reads diagrams and charts as well as the text. Slower and costs more."
            />
          </div>
        </div>
      )}
    </Modal>
  );
}

/**
 * Applies the category picker to a generated batch. `AUTO_CATEGORY` leaves the
 * generator's own assignments in place; anything else overrides every card, so
 * the categories it invented are dropped by the caller.
 */
function assignCategory(cards: GeneratedCard[], target: string): GeneratedCard[] {
  if (target === AUTO_CATEGORY) return cards;
  const categoryId = target === NO_CATEGORY ? undefined : target;
  return cards.map((card) => ({ ...card, categoryId }));
}
