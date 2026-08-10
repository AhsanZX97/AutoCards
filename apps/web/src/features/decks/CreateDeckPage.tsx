import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CARD_TYPE_DESCRIPTIONS,
  CARD_TYPE_LABELS,
  CARD_TYPES,
  DEFAULT_GENERATION_PRESET,
  DEFAULT_MODEL_ID,
  DIFFICULTIES,
  GENERATION_PRESET_DESCRIPTIONS,
  GENERATION_PRESET_LABELS,
  GENERATION_PRESETS,
  GENERATION_STAGE_LABELS,
  PLAN_LIMITS,
  SUPPORTED_FORMATS_LABEL,
  UploadQuotaExceededError,
  canCreateDeck,
  oversizedDocuments,
  resolvePreset,
  type CardType,
  type Difficulty,
  type GenerationPresetId,
  type GenerationProgress,
} from '@autocards/core';
import { useApp } from '../../lib/appContext';
import { Button, Card, CardBody, Chip, Field, InfoButton, Input, Modal, Progress, Slider, Switch, Tabs, Textarea } from '../../components/ui';
import { toast } from '../../components/ui/toastStore';
import { formatQuota, useUploadQuota } from '../../lib/useUploadQuota';
import { PlanLimitNotice } from '../billing/PlanLimitNotice';
import { UploadDropzone } from './UploadDropzone';

type Step = 'idle' | 'generating' | 'error';
/** Deck cards come from uploads, or the deck starts empty and is filled in by hand. */
type Mode = 'ai' | 'manual';

const MODE_TABS = [
  { id: 'ai', label: 'Generate with AI', icon: '✨' },
  { id: 'manual', label: 'Start from scratch', icon: '✏️' },
];

export function CreateDeckPage() {
  const app = useApp();
  const navigate = useNavigate();

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
    if (files.length === 0 || !title.trim() || !userId || !quota.canUpload || !hasDeckRoom) return;
    setStep('generating');
    setErrorMessage('');

    updateDefaults({ preset, cardCount, cardTypes, difficulty, autoCategories, includeHints, includeExplanations, includeSourceQuotes, readImages });

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
          `${names} ${tooLong.length === 1 ? 'is' : 'are'} longer than the ${PLAN_LIMITS[plan].maxPagesPerPdf} pages your plan reads in one document. Split it up, or move to a bigger plan.`,
        );
      }

      const result = await app.services.llm.generateDeck({
        documents,
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
          language: 'en',
        },
        onProgress: setProgress,
      });
      const deck = createDeckFromGeneration(result, userId, { title, description });
      // Spent on the way out rather than the way in: a run that never reached
      // the model — a bad key, an unreadable file — costs nothing to fix.
      // The server counts it too, and its number wins where it sent one.
      quota.record(result.quota);
      toast({ variant: 'success', title: 'Deck created!', description: `${result.cards.length} flashcards generated.` });
      navigate(`/app/decks/${deck.id}`);
    } catch (err) {
      // Being turned away is itself news about the allowance: the meter was
      // showing uploads left or the button would have been disabled.
      if (err instanceof UploadQuotaExceededError && err.quota) quota.record(err.quota);
      setErrorMessage(err instanceof Error ? err.message : 'Something went wrong generating your deck.');
      setStep('error');
    }
  }

  function createManualDeck() {
    const name = title.trim();
    if (!name || !userId || !hasDeckRoom) return;
    // No upload, no model call — so this never touches the upload quota.
    const deck = createBlankDeck(userId, name);
    if (description.trim()) updateDeck(deck.id, { description: description.trim() });
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
            ? 'Upload your material and Auto Cards will write the flashcards for you.'
            : 'Start with an empty deck and write the cards yourself.'}
        </p>
      </div>

      {step === 'idle' && <Tabs items={MODE_TABS} active={mode} onChange={(id) => setMode(id as Mode)} />}

      {step === 'idle' && !hasDeckRoom && (
        <PlanLimitNotice
          message={`You have all ${PLAN_LIMITS[plan].maxDecks} decks your plan allows. Delete one to make room, or move to a plan with no limit.`}
        />
      )}

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
              Reading your files and writing cards. Larger decks take a minute.
            </p>
          </CardBody>
        </Card>
      )}

      {step === 'idle' && mode === 'manual' && (
        <Card>
          <CardBody className="space-y-6">
            <Field label="Deck name">
              <Input
                autoFocus
                placeholder="e.g. Financial Accounting, Chapter 4"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') createManualDeck();
                }}
              />
            </Field>
            <Field label="Description" hint="optional">
              <Textarea
                rows={2}
                placeholder="What this deck covers…"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </Field>
            <div className="flex items-center justify-end">
              <Button size="lg" disabled={!title.trim() || !hasDeckRoom} onClick={createManualDeck}>
                Create empty deck
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {step === 'idle' && mode === 'ai' && (
        <div className="space-y-6">
          {!quota.canUpload && (
            <PlanLimitNotice
              message={`You have used all ${quota.limit} of this month’s generations. Your allowance resets on the 1st.`}
            />
          )}
          <Card>
            <CardBody className="space-y-6">
              <Field label="Deck name">
                <Input
                  autoFocus
                  placeholder="e.g. Financial Accounting, Chapter 4"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </Field>
              <Field label="Description" hint="optional">
                <Textarea
                  rows={2}
                  placeholder="What this deck covers…"
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
                onChange={setFiles}
                hint={`Slides, notes, a chapter, a past paper. Takes ${SUPPORTED_FORMATS_LABEL}. Add several and the cards are written from all of them at once.`}
              />
            </CardBody>
          </Card>

          <Card>
            <CardBody className="space-y-6">
              <h3 className="font-semibold text-slate-900 dark:text-white">Generation options</h3>

              <Field
                label="What are these cards for?"
                hint="Sets the card types to match. Change them below if you want."
              >
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
                <Switch checked={autoCategories} onChange={setAutoCategories} label="Auto-categorize" description="Group related cards under headings picked to suit what the cards are for" />
                <Switch checked={includeHints} onChange={setIncludeHints} label="Include hints" description="Add a hint to harder cards" />
                <Switch checked={includeExplanations} onChange={setIncludeExplanations} label="Include explanations" description="Explain why the answer is correct" />
                <Switch checked={includeSourceQuotes} onChange={setIncludeSourceQuotes} label="Quote source passages" description="Show the original text each card was based on" />
                <Switch
                  checked={readImages}
                  onChange={setReadImages}
                  label="Read the pictures too"
                  description="Reads diagrams and charts as well as the text. Slower and costs more, so best saved for slides that are mostly pictures."
                />
              </div>
            </CardBody>
          </Card>

          <div className="flex items-center justify-end gap-4">
            <span className="text-xs text-slate-400">{formatQuota(quota)}</span>
            <Button
              size="lg"
              disabled={files.length === 0 || !title.trim() || !quota.canUpload || !hasDeckRoom}
              onClick={startGeneration}
            >
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
