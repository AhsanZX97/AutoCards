import type { Id } from './common';

export interface DayActivity {
  /** `YYYY-MM-DD` in the learner's local timezone. */
  date: string;
  sessions: number;
  cards: number;
  correct: number;
  xp: number;
  minutes: number;
}

export interface StreakInfo {
  current: number;
  longest: number;
  /** `YYYY-MM-DD` of the most recent day with activity. */
  lastActiveDate?: string;
  /** True when today has not been studied yet but yesterday was. */
  atRisk: boolean;
}

export interface LevelInfo {
  level: number;
  xp: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  /** 0–1 progress through the current level. */
  progress: number;
}

export interface DeckPerformance {
  deckId: Id;
  deckTitle: string;
  sessions: number;
  cards: number;
  accuracy: number;
  xp: number;
  averageScore: number;
}

export interface OverallStats {
  totalSessions: number;
  totalCards: number;
  totalCorrect: number;
  accuracy: number;
  totalXp: number;
  totalMinutes: number;
  bestStreak: number;
  bestScore: number;
  level: LevelInfo;
  streak: StreakInfo;
  activity: DayActivity[];
  perDeck: DeckPerformance[];
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  unlocked: boolean;
  /** 0–1 toward unlocking. */
  progress: number;
}
