/** Branded-ish string aliases. Kept as plain strings so JSON round-trips cleanly. */
export type Id = string;

/** ISO-8601 timestamp string. Stored as a string so state persists to JSON as-is. */
export type IsoDate = string;

export const DIFFICULTIES = ['easy', 'medium', 'hard', 'expert'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const PRIORITIES = ['low', 'normal', 'high', 'critical'] as const;
export type Priority = (typeof PRIORITIES)[number];

/** Score multiplier applied to a correct answer, by card difficulty. */
export const DIFFICULTY_WEIGHT: Record<Difficulty, number> = {
  easy: 1,
  medium: 1.25,
  hard: 1.6,
  expert: 2,
};

/** How strongly a priority biases a card toward the front of the study queue. */
export const PRIORITY_WEIGHT: Record<Priority, number> = {
  low: 0.5,
  normal: 1,
  high: 2,
  critical: 3.5,
};

export const ACCENTS = [
  'indigo',
  'violet',
  'sky',
  'emerald',
  'amber',
  'rose',
  'teal',
  'slate',
] as const;
export type Accent = (typeof ACCENTS)[number];
