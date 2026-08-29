import type {
  ExtractedDocument,
  GenerationOptions,
  GenerationProgress,
  GenerationResult,
  UploadQuotaSnapshot,
} from '../../types';

export interface ModelInfo {
  /** OpenRouter slug, `vendor/model`. */
  id: string;
  name: string;
  vendor: string;
  /** Context window in tokens. */
  context: number;
  /** USD per million input tokens. */
  inputPrice: number;
  /** USD per million output tokens. */
  outputPrice: number;
  description: string;
  recommended?: boolean;
  /** Accepts images as well as text. Only these can be used with `readImages`. */
  vision?: boolean;
}

export interface GenerateArgs {
  /**
   * Every file the cards should be written from, in the order the user picked
   * them. They go up in one call rather than one call each, so the model can
   * see all of them at once — that is what lets it skip a fact the lecture
   * slides and the handout both make, and draw a line between the two.
   */
  documents: ExtractedDocument[];
  /**
   * Subjects to write cards about with no file behind them — "the Krebs
   * cycle", "React hooks", "Spanish subjunctive".
   *
   * A topic is material in its own right, not steering for an upload: the
   * model is told there is nothing written to be faithful to and answers from
   * its own knowledge of the subject. Steering an upload is what
   * {@link GenerationOptions.instructions} is for.
   *
   * Topics and documents can arrive together — one deck built from the lecture
   * slides plus the two things the lecturer never covered. With no documents
   * at all, the topics are the whole job.
   */
  topics?: string[];
  options: GenerationOptions;
  /**
   * Question sides already in the deck being added to. The model is told not to
   * write them again, which is cheaper than generating repeats and discarding
   * them — though the caller should still run `dropDuplicateCards` over the
   * result, because the instruction is followed loosely.
   *
   * Empty (or absent) when the generation is creating a new deck.
   */
  avoidPrompts?: string[];
  onProgress?: (progress: GenerationProgress) => void;
  signal?: AbortSignal;
}

export interface SuggestChoiceArgs {
  /** The question side of the card, for context. */
  front: string;
  /** The correct answer — the suggestion must not restate it. */
  back: string;
  /** Choice text already on the card, so the suggestion isn't a duplicate. */
  existingChoices: string[];
  model: string;
  signal?: AbortSignal;
}

/**
 * The single seam between the app and whatever writes the flashcards.
 * `OpenRouterLlmService` is the only implementation.
 */
export interface LlmService {
  /** Identifies the implementation in the UI, e.g. `openrouter`. */
  readonly id: string;
  listModels(): Promise<ModelInfo[]>;
  generateDeck(args: GenerateArgs): Promise<GenerationResult>;
  /** One plausible wrong answer for a multiple-choice card, pitched at its context. */
  suggestChoice(args: SuggestChoiceArgs): Promise<string>;
}

export class GenerationAbortedError extends Error {
  constructor() {
    super('Generation cancelled');
    this.name = 'GenerationAbortedError';
  }
}

/**
 * The account has no uploads left this month.
 *
 * Its own type because it is the one failure that is not a fault: nothing
 * broke, the plan simply ran out. The UI should offer a way forward — wait for
 * the reset, or move to a bigger plan — rather than a "try again".
 */
export class UploadQuotaExceededError extends Error {
  /**
   * The allowance as the server sees it. Carried on the refusal so a meter
   * that was showing uploads left can correct itself the moment it is told no.
   */
  readonly quota?: UploadQuotaSnapshot;

  constructor(message: string, quota?: UploadQuotaSnapshot) {
    super(message);
    this.name = 'UploadQuotaExceededError';
    if (quota) this.quota = quota;
  }
}
