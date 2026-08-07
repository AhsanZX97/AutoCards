import type { Accent, Id, IsoDate } from './common';
import type { StudySettings } from './study';

export interface Category {
  id: Id;
  name: string;
  accent: Accent;
  /** Emoji shown next to the name. */
  icon: string;
}

export interface SourceDocument {
  id: Id;
  filename: string;
  /** Bytes. */
  size: number;
  pageCount: number;
  /** Characters of text extracted from the PDF. */
  charCount: number;
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
  source?: SourceDocument;
  /** Model that produced the cards, e.g. `anthropic/claude-sonnet-4.5`. */
  generatedBy?: string;
  /** Per-deck defaults for the study setup screen. */
  defaultSettings: StudySettings;
  archived: boolean;
  createdAt: IsoDate;
  updatedAt: IsoDate;
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
