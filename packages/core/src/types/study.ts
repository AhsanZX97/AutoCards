import type { Difficulty, Id, IsoDate, Priority } from './common';

export const STUDY_MODES = [
  'classic',
  'timed',
  'exam',
  'cram',
  'survival',
] as const;
export type StudyMode = (typeof STUDY_MODES)[number];

export interface StudyModeInfo {
  id: StudyMode;
  label: string;
  description: string;
  icon: string;
}

export const STUDY_MODE_INFO: Record<StudyMode, StudyModeInfo> = {
  classic: {
    id: 'classic',
    label: 'Classic',
    description: 'Flip at your own pace and grade yourself. No clock.',
    icon: '🃏',
  },
  timed: {
    id: 'timed',
    label: 'Timed drill',
    description: 'A countdown on every card. Answer fast for bonus points.',
    icon: '⏱️',
  },
  exam: {
    id: 'exam',
    label: 'Exam',
    description: 'Auto-graded questions, one pass, results only at the end.',
    icon: '📝',
  },
  cram: {
    id: 'cram',
    label: 'Cram',
    description: 'Missed cards come back until every one is answered right.',
    icon: '🔁',
  },
  survival: {
    id: 'survival',
    label: 'Survival',
    description: 'Three lives. One run. See how far you get.',
    icon: '❤️',
  },
};

export const SHUFFLE_MODES = [
  'none',
  'random',
  'priority-first',
  'hardest-first',
  'weakest-first',
] as const;
export type ShuffleMode = (typeof SHUFFLE_MODES)[number];

export const SHUFFLE_MODE_LABELS: Record<ShuffleMode, string> = {
  none: 'Deck order',
  random: 'Random shuffle',
  'priority-first': 'Priority first',
  'hardest-first': 'Hardest first',
  'weakest-first': 'Weakest first',
};

export interface TimerSettings {
  enabled: boolean;
  /** Countdown per card, in seconds. */
  perCardSeconds: number;
  /** Whole-session cap in seconds. 0 disables it. */
  totalSeconds: number;
  /** Move on automatically when the per-card timer expires. */
  autoAdvance: boolean;
  /** Show a shrinking bar rather than a numeric countdown. */
  showAsBar: boolean;
}

export interface StudyFilters {
  categoryIds: Id[];
  tags: string[];
  difficulties: Difficulty[];
  priorities: Priority[];
  starredOnly: boolean;
  /** Leave out cards already at or above `masteredThreshold`. */
  excludeMastered: boolean;
  /** Cards at or above this mastery count as mastered. */
  masteredThreshold: number;
  /** 0 means no cap. */
  cardLimit: number;
}

export const GRADING_SCALES = ['binary', 'four-point'] as const;
export type GradingScale = (typeof GRADING_SCALES)[number];

export const GRADES = ['again', 'hard', 'good', 'easy'] as const;
export type Grade = (typeof GRADES)[number];

export interface StudySettings {
  mode: StudyMode;
  shuffle: ShuffleMode;
  /** Show the answer side first and ask for the question. */
  reversed: boolean;
  gradingScale: GradingScale;
  timer: TimerSettings;
  filters: StudyFilters;
  /** Award extra points for consecutive correct answers. */
  streakBonus: boolean;
  /** Award extra points for answering quickly. */
  speedBonus: boolean;
  /** Deduct points when a hint is revealed. */
  hintPenalty: boolean;
  /** Read the prompt aloud via text-to-speech. */
  readAloud: boolean;
  /** Play tick / correct / wrong sounds. */
  sound: boolean;
}

export interface CardAnswer {
  cardId: Id;
  grade: Grade;
  correct: boolean;
  /** Milliseconds from card shown to answer submitted. */
  timeMs: number;
  usedHint: boolean;
  /** Ran out of time rather than answering. */
  timedOut: boolean;
  /** What the learner typed or picked, for review on the results screen. */
  response?: string;
  answeredAt: IsoDate;
}

export interface ScoreBreakdown {
  answered: number;
  correct: number;
  /** 0–1. */
  accuracy: number;
  basePoints: number;
  difficultyBonus: number;
  speedBonus: number;
  streakBonus: number;
  hintPenalty: number;
  timeoutPenalty: number;
  finalScore: number;
  maxStreak: number;
  /** Mean answer time in ms across answered cards. */
  averageTimeMs: number;
  xp: number;
  letter: LetterGrade;
}

export const LETTER_GRADES = ['S', 'A', 'B', 'C', 'D', 'F'] as const;
export type LetterGrade = (typeof LETTER_GRADES)[number];

export const SESSION_STATUSES = ['active', 'completed', 'abandoned'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export interface StudySession {
  id: Id;
  deckId: Id;
  deckTitle: string;
  settings: StudySettings;
  /** Card ids in the order they will be shown. Cram mode re-appends misses. */
  queue: Id[];
  /** Index into `queue`. */
  position: number;
  answers: CardAnswer[];
  /** Survival mode only. */
  livesRemaining: number;
  status: SessionStatus;
  startedAt: IsoDate;
  endedAt?: IsoDate;
  /** Wall-clock duration, excluding paused time. */
  durationMs: number;
  score: ScoreBreakdown;
}

/** A finished session, trimmed for the history list. */
export interface SessionSummary {
  id: Id;
  deckId: Id;
  deckTitle: string;
  mode: StudyMode;
  answered: number;
  correct: number;
  accuracy: number;
  finalScore: number;
  xp: number;
  letter: LetterGrade;
  maxStreak: number;
  durationMs: number;
  endedAt: IsoDate;
}
