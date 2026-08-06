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

/**
 * The single seam between the app and whatever writes the flashcards.
 * `MockLlmService` implements it today; `OpenRouterLlmService` takes over once
 * a real key is wired up.
 */
export interface LlmService {
  /** Identifies the implementation in the UI, e.g. `mock` or `openrouter`. */
  readonly id: string;
  readonly isMock: boolean;
  listModels(): Promise<ModelInfo[]>;
  generateDeck(args: GenerateArgs): Promise<GenerationResult>;
}

export class GenerationAbortedError extends Error {
  constructor() {
    super('Generation cancelled');
    this.name = 'GenerationAbortedError';
  }
}
