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
}

export interface GenerateArgs {
  document: ExtractedDocument;
  options: GenerationOptions;
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
