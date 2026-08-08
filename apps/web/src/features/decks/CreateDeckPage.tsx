import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CARD_TYPE_DESCRIPTIONS,
  CARD_TYPE_LABELS,
  CARD_TYPES,
  DEFAULT_MODEL_ID,
  DIFFICULTIES,
  GENERATION_STAGE_LABELS,
  type CardType,
  type Difficulty,
  type GenerationProgress,
} from '@autocards/core';
import { useApp } from '../../lib/appContext';
import { Button, Card, CardBody, Chip, Field, InfoButton, Input, Modal, Progress, Slider, Switch, Tabs, Textarea } from '../../components/ui';
import { toast } from '../../components/ui/toastStore';
import { formatQuota, useUploadQuota } from '../../lib/useUploadQuota';

type Step = 'idle' | 'generating' | 'error';
/** Deck cards come from a PDF, or the deck starts empty and is filled in by hand. */
type Mode = 'ai' | 'manual';

const MODE_TABS = [
  { id: 'ai', label: 'Generate with AI', icon: '✨' },
  { id: 'manual', label: 'Start from scratch', icon: '✏️' },
];

export function CreateDeckPage() {
  const app = useApp();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const userId = app.authStore((s) => s.session?.user.id);
  const quota = useUploadQuota();
  const defaults = app.settingsStore((s) => s.generationDefaults);
  const updateDefaults = app.settingsStore((s) => s.updateGenerationDefaults);
  const createDeckFromGeneration = app.deckStore((s) => s.createDeckFromGeneration);
  const createBlankDeck = app.deckStore((s) => s.createBlankDeck);
  const updateDeck = app.deckStore((s) => s.updateDeck);

  const [mode, setMode] = useState<Mode>('ai');
  const [step, setStep] = useState<Step>('idle');
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [progress, setProgress] = useState<GenerationProgress | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  const [manualTitle, setManualTitle] = useState('');
  const [manualDescription, setManualDescription] = useState('');

  const [cardCount, setCardCount] = useState(defaults.cardCount);
  const [cardTypes, setCardTypes] = useState<CardType[]>(defaults.cardTypes);
  const [difficulty, setDifficulty] = useState<Difficulty>(defaults.difficulty);
  const [autoCategories, setAutoCategories] = useState(defaults.autoCategories);
  const [includeHints, setIncludeHints] = useState(defaults.includeHints);
  const [includeExplanations, setIncludeExplanations] = useState(defaults.includeExplanations);
  const [includeSourceQuotes, setIncludeSourceQuotes] = useState(defaults.includeSourceQuotes);
  const [instructions, setInstructions] = useState('');
  const [typeHelpOpen, setTypeHelpOpen] = useState(false);

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
    if (!file || !userId || !quota.canUpload) return;
    setStep('generating');
    setErrorMessage('');

    updateDefaults({ cardCount, cardTypes, difficulty, autoCategories, includeHints, includeExplanations, includeSourceQuotes });

    try {
      const document = await app.services.pdf.extract(file);
      const result = await app.services.llm.generateDeck({
        document,
        options: {
          // Model choice is not a decision to put in front of a student, so the
          // page always runs on the house default rather than exposing a picker.
          model: DEFAULT_MODEL_ID,
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
        onProgress: setProgress,
      });
      const deck = createDeckFromGeneration(result, userId);
      // Spent on the way out rather than the way in: a run that never reached
      // the model — a bad key, an unreadable PDF — costs nothing to fix.
      quota.record();
      toast({ variant: 'success', title: 'Deck created!', description: `${result.cards.length} flashcards generated.` });
      navigate(`/app/decks/${deck.id}`);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Something went wrong generating your deck.');
      setStep('error');
    }
  }

  function createManualDeck() {
    const title = manualTitle.trim();
    if (!title || !userId) return;
    // No PDF, no model call — so this never touches the upload quota.
    const deck = createBlankDeck(userId, title);
    if (manualDescription.trim()) updateDeck(deck.id, { description: manualDescription.trim() });
    toast({ variant: 'success', title: 'Deck created!', description: 'Add your first card to get going.' });
    navigate(`/app/decks/${deck.id}`);
  }

  function tryAgain() {
    setErrorMessage('');
    setStep('idle');
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">Create a deck</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {mode === 'ai'
            ? 'Upload a PDF and Auto Cards will write the flashcards for you.'
            : 'Start with an empty deck and write the cards yourself.'}
        </p>
      </div>

      {step === 'idle' && <Tabs items={MODE_TABS} active={mode} onChange={(id) => setMode(id as Mode)} />}

      {step === 'error' && (
        <Card>
          <CardBody className="flex flex-col items-center py-14 text-center">
            <span className="text-4xl">⚠️</span>
            <p className="mt-4 font-semibold text-slate-800 dark:text-slate-200">Generation failed</p>
            <p className="mt-1 max-w-sm text-sm text-slate-400">{errorMessage}</p>
            <Button className="mt-6" onClick={tryAgain}>
              Try again
            </Button>
          </CardBody>
        </Card>
      )}

      {step === 'generating' && (
        <Card>
          <CardBody className="flex flex-col items-center py-14 text-center">
            <div className="relative flex h-20 w-20 items-center justify-center">
              <span className="animate-pulse text-4xl">🧠</span>
            </div>
            <p className="mt-4 font-semibold text-slate-800 dark:text-slate-200">
              {progress ? GENERATION_STAGE_LABELS[progress.stage] : 'Getting started…'}
            </p>
            {progress && <p className="mt-1 text-sm text-slate-400">{progress.message}</p>}
            <Progress value={progress?.progress ?? 0} className="mt-6 w-full max-w-xs" />
            <p className="mt-6 text-xs text-slate-400">Reading your PDF and writing cards. Larger decks take a minute.</p>
          </CardBody>
        </Card>
      )}

      {step === 'idle' && mode === 'manual' && (
        <Card>
          <CardBody className="space-y-6">
            <Field label="Deck name">
              <Input
                autoFocus
                placeholder="e.g. Financial Accounting — Chapter 4"
                value={manualTitle}
                onChange={(e) => setManualTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') createManualDeck();
                }}
              />
            </Field>
            <Field label="Description" hint="optional">
              <Textarea
                rows={2}
                placeholder="What this deck covers…"
                value={manualDescription}
                onChange={(e) => setManualDescription(e.target.value)}
              />
            </Field>
            <div className="flex items-center justify-end">
              <Button size="lg" disabled={!manualTitle.trim()} onClick={createManualDeck}>
                Create empty deck
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {step === 'idle' && mode === 'ai' && (
        <div className="space-y-6">
          {!quota.canUpload && (
            <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
              You have used all {quota.limit} of this month’s uploads. Upgrade your plan in Settings → Billing to
              convert more PDFs.
            </p>
          )}
          <Card>
            <CardBody>
              {file ? (
                <div className="flex items-center gap-3">
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
                  className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-16 text-center transition-colors ${
                    dragActive
                      ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/10'
                      : 'border-slate-300 hover:border-brand-400 dark:border-slate-700'
                  }`}
                >
                  <span className="text-4xl">📄</span>
                  <p className="mt-4 font-semibold text-slate-800 dark:text-slate-200">
                    Drop your PDF here, or click to browse
                  </p>
                  <p className="mt-1 text-sm text-slate-400">Lecture notes, textbook chapters, reports — up to 20 pages on the free plan.</p>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
              />
            </CardBody>
          </Card>

          <Card>
            <CardBody className="space-y-6">
              <h3 className="font-semibold text-slate-900 dark:text-white">Generation options</h3>

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
                <div className="mb-2 flex items-center gap-1.5">
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Card types to include</p>
                  <InfoButton label="What do these card types mean?" onClick={() => setTypeHelpOpen(true)} />
                </div>
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

              <Field label="Custom instructions" hint="optional">
                <Textarea
                  rows={2}
                  placeholder="e.g. Focus on chapter 3, write cards for a final exam…"
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                />
              </Field>

              <div className="space-y-1 border-t border-slate-100 pt-4 dark:border-slate-800">
                <Switch checked={autoCategories} onChange={setAutoCategories} label="Auto-categorize" description="Group cards into categories drawn from the document" />
                <Switch checked={includeHints} onChange={setIncludeHints} label="Include hints" description="Add a hint to harder cards" />
                <Switch checked={includeExplanations} onChange={setIncludeExplanations} label="Include explanations" description="Explain why the answer is correct" />
                <Switch checked={includeSourceQuotes} onChange={setIncludeSourceQuotes} label="Quote source passages" description="Show the original text each card was based on" />
              </div>
            </CardBody>
          </Card>

          <div className="flex items-center justify-end gap-4">
            <span className="text-xs text-slate-400">{formatQuota(quota)}</span>
            <Button size="lg" disabled={!file || !quota.canUpload} onClick={startGeneration}>
              Generate flashcards
            </Button>
          </div>
        </div>
      )}

      <Modal
        open={typeHelpOpen}
        onClose={() => setTypeHelpOpen(false)}
        title="Card types"
        description="What each one looks like when you study."
        size="md"
        footer={<Button onClick={() => setTypeHelpOpen(false)}>Got it</Button>}
      >
        <dl className="space-y-3.5 text-sm">
          {CARD_TYPES.map((type) => (
            <div key={type}>
              <dt className="font-semibold text-slate-800 dark:text-slate-100">{CARD_TYPE_LABELS[type]}</dt>
              <dd className="mt-0.5 text-slate-600 dark:text-slate-400">{CARD_TYPE_DESCRIPTIONS[type]}</dd>
            </div>
          ))}
        </dl>
      </Modal>
    </div>
  );
}
