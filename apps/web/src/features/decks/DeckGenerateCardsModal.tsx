import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CARD_TYPE_LABELS,
  CARD_TYPES,
  DIFFICULTIES,
  GENERATION_STAGE_LABELS,
  type CardType,
  type Deck,
  type Difficulty,
  type Flashcard,
  type GeneratedCard,
  type GenerationProgress,
  type ModelInfo,
} from '@autocards/core';
import { useApp } from '../../lib/appContext';
import { Button, Chip, Field, Modal, Progress, Select, Slider, Switch, Textarea } from '../../components/ui';
import { toast } from '../../components/ui/toastStore';
import { getPromptText } from '../../lib/cardText';
import { formatQuota, useUploadQuota } from '../../lib/useUploadQuota';

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
 * Adds cards to a deck that already exists, from a second PDF.
 *
 * Same pipeline as creating a deck (extract → generate → normalize) and the
 * same allowance is spent, so the options offered here are the generation
 * options minus the ones that only make sense while naming a new deck. Two
 * things are different: the model is shown what the deck already asks, and
 * whatever comes back is de-duplicated against it on the way in.
 */
export function DeckGenerateCardsModal({ open, onClose, deck, cards }: DeckGenerateCardsModalProps) {
  const app = useApp();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const quota = useUploadQuota();

  const defaults = app.settingsStore((s) => s.generationDefaults);
  const updateDefaults = app.settingsStore((s) => s.updateGenerationDefaults);
  const addGeneratedCards = app.deckStore((s) => s.addGeneratedCards);

  const [step, setStep] = useState<Step>('setup');
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [progress, setProgress] = useState<GenerationProgress | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  const [cardCount, setCardCount] = useState(defaults.cardCount);
  const [cardTypes, setCardTypes] = useState<CardType[]>(defaults.cardTypes);
  const [difficulty, setDifficulty] = useState<Difficulty>(defaults.difficulty);
  const [model, setModel] = useState(defaults.model);
  const [categoryTarget, setCategoryTarget] = useState<string>(AUTO_CATEGORY);
  const [includeHints, setIncludeHints] = useState(defaults.includeHints);
  const [includeExplanations, setIncludeExplanations] = useState(defaults.includeExplanations);
  const [includeSourceQuotes, setIncludeSourceQuotes] = useState(defaults.includeSourceQuotes);
  const [instructions, setInstructions] = useState('');

  // Reopening after a failed or finished run should start clean rather than on
  // the last run's error screen.
  useEffect(() => {
    if (!open) return;
    setStep('setup');
    setFile(null);
    setProgress(null);
    setErrorMessage('');
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    app.services.llm
      .listModels()
      .then((available) => {
        if (cancelled) return;
        setModels(available);
        // A saved default can name a model OpenRouter no longer serves, which
        // would fail the whole run with a 404. Snap to a live one.
        setModel((current) =>
          available.some((m) => m.id === current)
            ? current
            : available.find((m) => m.recommended)?.id ?? available[0]?.id ?? current,
        );
      })
      .catch(() => {
        if (!cancelled) setModels([]);
      });
    return () => {
      cancelled = true;
    };
  }, [app, open]);

  const handleFile = useCallback((selected: File | null) => {
    if (!selected) return;
    if (selected.type !== 'application/pdf' && !selected.name.toLowerCase().endsWith('.pdf')) {
      toast({ variant: 'error', title: 'Please upload a PDF file.' });
      return;
    }
    setFile(selected);
  }, []);

  function toggleCardType(type: CardType) {
    setCardTypes((prev) => {
      if (prev.includes(type)) {
        if (prev.length === 1) return prev; // keep at least one
        return prev.filter((t) => t !== type);
      }
      return [...prev, type];
    });
  }

  async function startGeneration() {
    if (!file || !quota.canUpload) return;
    const autoCategories = categoryTarget === AUTO_CATEGORY;

    setStep('generating');
    setErrorMessage('');
    updateDefaults({ model, cardCount, cardTypes, difficulty, includeHints, includeExplanations, includeSourceQuotes });

    try {
      const document = await app.services.pdf.extract(file);
      const result = await app.services.llm.generateDeck({
        document,
        options: {
          model,
          cardCount,
          cardTypes,
          difficulty,
          autoCategories,
          includeHints,
          includeExplanations,
          includeSourceQuotes,
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
      // it is spent even when every card turned out to be a repeat.
      quota.record();

      if (added.length === 0) {
        setErrorMessage(
          `Every card ${model} wrote was already in this deck. Try a different section of the document, or add custom instructions pointing it somewhere new.`,
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
      setErrorMessage(err instanceof Error ? err.message : 'Something went wrong generating your cards.');
      setStep('error');
    }
  }

  return (
    <Modal
      open={open}
      onClose={step === 'generating' ? () => {} : onClose}
      title="Add cards from a PDF"
      description={`New cards are checked against the ${cards.length} already in ${deck.title}.`}
      size="lg"
      footer={
        step === 'setup' ? (
          <>
            <span className="mr-auto text-xs text-slate-400">{formatQuota(quota)}</span>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={startGeneration} disabled={!file || !quota.canUpload}>
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
        ) : undefined
      }
    >
      {step === 'generating' && (
        <div className="flex flex-col items-center py-10 text-center">
          <span className="animate-pulse text-4xl">🧠</span>
          <p className="mt-4 font-semibold text-slate-800 dark:text-slate-200">
            {progress ? GENERATION_STAGE_LABELS[progress.stage] : 'Getting started…'}
          </p>
          {progress && <p className="mt-1 text-sm text-slate-400">{progress.message}</p>}
          <Progress value={progress?.progress ?? 0} className="mt-6 w-full max-w-xs" />
          <p className="mt-6 text-xs text-slate-400">Calling {model} via OpenRouter. This takes a minute.</p>
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
            <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
              You have used all {quota.limit} of this month’s uploads. Upgrade your plan in Settings → Billing, or
              write the card yourself.
            </p>
          )}

          {file ? (
            <div className="flex items-center gap-3 rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
              <span className="text-2xl">📄</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">{file.name}</p>
                <p className="text-xs text-slate-400">{(file.size / 1024).toFixed(0)} KB</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setFile(null)}>
                Change
              </Button>
            </div>
          ) : (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragActive(false);
                handleFile(e.dataTransfer.files[0] ?? null);
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
                dragActive
                  ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/10'
                  : 'border-slate-300 hover:border-brand-400 dark:border-slate-700'
              }`}
            >
              <span className="text-3xl">📄</span>
              <p className="mt-3 font-semibold text-slate-800 dark:text-slate-200">
                Drop a PDF here, or click to browse
              </p>
              <p className="mt-1 text-sm text-slate-400">Another chapter, a past paper, a set of lecture slides.</p>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          />

          <Field label="Model" hint="Better models produce better cards">
            <Select value={model} onChange={(e) => setModel(e.target.value)}>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} {m.recommended ? '(recommended)' : ''}
                </option>
              ))}
            </Select>
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
              placeholder="e.g. Only cover chapter 5 — the deck already has chapters 1–4."
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
