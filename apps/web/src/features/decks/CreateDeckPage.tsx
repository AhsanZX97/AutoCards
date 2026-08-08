import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CARD_TYPE_LABELS,
  CARD_TYPES,
  DIFFICULTIES,
  GENERATION_STAGE_LABELS,
  type CardType,
  type Difficulty,
  type GenerationProgress,
  type ModelInfo,
} from '@autocards/core';
import { useApp } from '../../lib/appContext';
import { Button, Card, CardBody, Chip, Field, Input, Progress, Select, Slider, Switch, Textarea } from '../../components/ui';
import { toast } from '../../components/ui/toastStore';
import { formatQuota, useUploadQuota } from '../../lib/useUploadQuota';

type Step = 'idle' | 'generating' | 'error';

export function CreateDeckPage() {
  const app = useApp();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const userId = app.authStore((s) => s.session?.user.id);
  const quota = useUploadQuota();
  const defaults = app.settingsStore((s) => s.generationDefaults);
  const updateDefaults = app.settingsStore((s) => s.updateGenerationDefaults);
  const createDeckFromGeneration = app.deckStore((s) => s.createDeckFromGeneration);

  const [step, setStep] = useState<Step>('idle');
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [progress, setProgress] = useState<GenerationProgress | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  const [cardCount, setCardCount] = useState(defaults.cardCount);
  const [cardTypes, setCardTypes] = useState<CardType[]>(defaults.cardTypes);
  const [difficulty, setDifficulty] = useState<Difficulty>(defaults.difficulty);
  const [model, setModel] = useState(defaults.model);
  const [autoCategories, setAutoCategories] = useState(defaults.autoCategories);
  const [includeHints, setIncludeHints] = useState(defaults.includeHints);
  const [includeExplanations, setIncludeExplanations] = useState(defaults.includeExplanations);
  const [includeSourceQuotes, setIncludeSourceQuotes] = useState(defaults.includeSourceQuotes);
  const [instructions, setInstructions] = useState('');

  useEffect(() => {
    let cancelled = false;
    app.services.llm
      .listModels()
      .then((available) => {
        if (cancelled) return;
        setModels(available);
        // The saved default can name a model OpenRouter no longer serves, which
        // would fail the whole generation with a 404. Snap to a live one.
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
  }, [app]);

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

    updateDefaults({ model, cardCount, cardTypes, difficulty, autoCategories, includeHints, includeExplanations, includeSourceQuotes });

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

  function tryAgain() {
    setErrorMessage('');
    setStep('idle');
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">Create a deck</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Upload a PDF and Auto Cards will write the flashcards for you.</p>
      </div>

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
            <p className="mt-6 text-xs text-slate-400">
              Calling {model} via OpenRouter. Larger decks take a minute.
            </p>
          </CardBody>
        </Card>
      )}

      {step === 'idle' && (
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

              <Field label="Model" hint="Better models produce better cards">
                <Select value={model} onChange={(e) => setModel(e.target.value)}>
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} {m.recommended ? '(recommended)' : ''} — ${formatPrice(m.inputPrice)}/${formatPrice(m.outputPrice)} per M tok
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
    </div>
  );
}

/** Live OpenRouter pricing carries float noise (e.g. 0.26899999999999996); round it to cents for display. */
function formatPrice(price: number): number {
  return Math.round(price * 100) / 100;
}
