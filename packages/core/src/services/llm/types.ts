import type {
  ExtractedDocument,
  GenerationOptions,
  GenerationProgress,
  GenerationResult,
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
