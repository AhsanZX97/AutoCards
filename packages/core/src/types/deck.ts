import type { Accent, Id, IsoDate } from './common';
import type { StudySettings } from './study';

export interface Category {
  id: Id;
  name: string;
  accent: Accent;
  /** Emoji shown next to the name. */
  icon: string;
}

/**
 * The file formats an upload can arrive as.
 *
 * `pdf` and `slides` paginate; `document` and `text` are flow formats where
 * pagination is decided by whatever renders them, so they have no page count
 * to report. Legacy `.doc` is deliberately absent — see `documentKindOf`.
 */
export const DOCUMENT_KINDS = ['pdf', 'slides', 'document', 'text'] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export const DOCUMENT_KIND_ICONS: Record<DocumentKind, string> = {
  pdf: '📄',
  slides: '📊',
  document: '📝',
  text: '🗒️',
};

export interface SourceDocument {
  id: Id;
  filename: string;
  /** Bytes. */
  size: number;
  /**
   * Absent for flow formats. A `.docx` has no page count in the file at all —
   * Word works it out at render time from the fonts and paper size — so there
   * is nothing honest to put here.
   */
  pageCount?: number;
  /** Characters of text extracted from the file. */
  charCount: number;
  /** Defaults to `pdf` on sources recorded before other formats were read. */
  kind?: DocumentKind;
  uploadedAt: IsoDate;
}

export interface Deck {
  id: Id;
  ownerId: Id;
  title: string;
  description: string;
  icon: string;
  accent: Accent;
  tags: string[];
  categories: Category[];
  /**
   * Every file the deck was generated from. Absent on hand-written decks.
   *
   * Superseded {@link Deck.source}, which only ever held one. Read both through
   * {@link deckSources} rather than either directly — decks synced before
   * multi-upload still carry the singular field and are never rewritten.
   */
  sources?: SourceDocument[];
  /** @deprecated Written before a deck could come from more than one file. */
  source?: SourceDocument;
  /** Model that produced the cards, e.g. `anthropic/claude-sonnet-4.5`. */
  generatedBy?: string;
  /** Per-deck defaults for the study setup screen. */
  defaultSettings: StudySettings;
  archived: boolean;
  createdAt: IsoDate;
  updatedAt: IsoDate;
}

/**
 * The files a deck was built from, whichever field they were stored under.
 * Empty for a deck written by hand.
 */
export function deckSources(deck: Pick<Deck, 'sources' | 'source'>): SourceDocument[] {
  if (deck.sources) return deck.sources;
  return deck.source ? [deck.source] : [];
}

export interface DeckStats {
  total: number;
  new: number;
  learning: number;
  review: number;
  mastered: number;
  suspended: number;
  starred: number;
  /** Mean mastery across non-suspended cards, 0–100. */
  averageMastery: number;
}
