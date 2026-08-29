import type { GeneratedCard } from '../../types';

/** A Quizlet set, as it comes back from the import. */
export interface ImportedQuizletSet {
  /** The set's own title, used to name the deck when nobody named it. */
  title?: string;
  cards: GeneratedCard[];
}

/**
 * Fetches a shared Quizlet set and returns its cards.
 *
 * Behind an interface like every other service, and for the usual reason —
 * but also because this one can be turned off. It is `null` wherever the Edge
 * Functions are not deployed, and the screen hides the option rather than
 * offering something that cannot work.
 */
export interface QuizletImporter {
  readonly id: string;
  importSet(url: string, signal?: AbortSignal): Promise<ImportedQuizletSet>;
}

/**
 * A set that could not be fetched, with a message written for the person who
 * pasted the link.
 *
 * Its own type so the screen can offer the way round it — pasting the cards
 * in by hand — rather than showing a dead end.
 */
export class QuizletImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QuizletImportError';
  }
}
