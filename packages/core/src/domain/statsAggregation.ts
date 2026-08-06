import { lastNDayKeys, toDayKey } from '../lib/date';
import type { Achievement, DayActivity, DeckPerformance, LevelInfo, OverallStats, SessionSummary, StreakInfo, StudySession } from '../types';

const ACTIVITY_WINDOW_DAYS = 84; // 12 weeks, for the heatmap
/** XP needed for level N = BASE * N^EXP. Keeps early levels quick, later ones a grind. */
const LEVEL_BASE_XP = 100;
const LEVEL_EXPONENT = 1.4;

export function levelFromXp(totalXp: number): LevelInfo {
  let level = 1;
  let xpConsumed = 0;
  let xpForThisLevel = xpForLevel(level);
  while (xpConsumed + xpForThisLevel <= totalXp) {
    xpConsumed += xpForThisLevel;
    level += 1;
    xpForThisLevel = xpForLevel(level);
  }
  const xpIntoLevel = totalXp - xpConsumed;
  return {
    level,
    xp: totalXp,
    xpIntoLevel,
    xpForNextLevel: xpForThisLevel,
    progress: xpForThisLevel > 0 ? xpIntoLevel / xpForThisLevel : 0,
  };
}

function xpForLevel(level: number): number {
  return Math.round(LEVEL_BASE_XP * Math.pow(level, LEVEL_EXPONENT));
}

export function computeStreak(activity: ReadonlyMap<string, DayActivity>, now: Date = new Date()): StreakInfo {
  const today = toDayKey(now);
  const days = lastNDayKeys(400, now);
  const activeDays = new Set(
    days.filter((day) => (activity.get(day)?.cards ?? 0) > 0),
  );

  let longest = 0;
  let run = 0;
  for (const day of days) {
    if (activeDays.has(day)) {
      run += 1;
      longest = Math.max(longest, run);
    } else {
      run = 0;
    }
  }

  let current = 0;
  const reversedDays = days.slice().reverse();
  const todayActive = activeDays.has(today);
  const startIndex = todayActive ? 0 : 1; // allow "yesterday was active, today not yet" without breaking the streak
  for (let i = startIndex; i < reversedDays.length; i += 1) {
    if (activeDays.has(reversedDays[i] as string)) {
      current += 1;
    } else {
      break;
    }
  }

  const lastActiveDate = [...activeDays].sort().pop();
  const atRisk = !todayActive && current > 0;

  return { current, longest, lastActiveDate, atRisk };
}

/** Groups session summaries into the day-bucketed activity the heatmap renders. */
export function buildActivity(
  sessions: readonly SessionSummary[],
  now: Date = new Date(),
): DayActivity[] {
  const byDay = new Map<string, DayActivity>();
  for (const session of sessions) {
    const day = toDayKey(session.endedAt);
    const entry = byDay.get(day) ?? {
      date: day,
      sessions: 0,
      cards: 0,
      correct: 0,
      xp: 0,
      minutes: 0,
    };
    entry.sessions += 1;
    entry.cards += session.answered;
    entry.correct += session.correct;
    entry.xp += session.xp;
    entry.minutes += Math.round(session.durationMs / 60_000);
    byDay.set(day, entry);
  }

  return lastNDayKeys(ACTIVITY_WINDOW_DAYS, now).map(
    (day) => byDay.get(day) ?? { date: day, sessions: 0, cards: 0, correct: 0, xp: 0, minutes: 0 },
  );
}

export function buildDeckPerformance(sessions: readonly SessionSummary[]): DeckPerformance[] {
  const byDeck = new Map<string, DeckPerformance & { accuracySum: number; scoreSum: number }>();
  for (const session of sessions) {
    const entry = byDeck.get(session.deckId) ?? {
      deckId: session.deckId,
      deckTitle: session.deckTitle,
      sessions: 0,
      cards: 0,
      accuracy: 0,
      xp: 0,
      averageScore: 0,
      accuracySum: 0,
      scoreSum: 0,
    };
    entry.sessions += 1;
    entry.cards += session.answered;
    entry.xp += session.xp;
    entry.accuracySum += session.accuracy;
    entry.scoreSum += session.finalScore;
    byDeck.set(session.deckId, entry);
  }

  return [...byDeck.values()]
    .map((entry) => ({
      deckId: entry.deckId,
      deckTitle: entry.deckTitle,
      sessions: entry.sessions,
      cards: entry.cards,
      xp: entry.xp,
      accuracy: entry.accuracySum / entry.sessions,
      averageScore: Math.round(entry.scoreSum / entry.sessions),
    }))
    .sort((a, b) => b.xp - a.xp);
}

export function computeOverallStats(
  sessions: readonly SessionSummary[],
  now: Date = new Date(),
): OverallStats {
  const totalSessions = sessions.length;
  const totalCards = sessions.reduce((sum, s) => sum + s.answered, 0);
  const totalCorrect = sessions.reduce((sum, s) => sum + s.correct, 0);
  const totalXp = sessions.reduce((sum, s) => sum + s.xp, 0);
  const totalMinutes = sessions.reduce((sum, s) => sum + Math.round(s.durationMs / 60_000), 0);
  const bestStreak = sessions.reduce((max, s) => Math.max(max, s.maxStreak), 0);
  const bestScore = sessions.reduce((max, s) => Math.max(max, s.finalScore), 0);

  const activity = buildActivity(sessions, now);
  const activityByDay = new Map(activity.map((a) => [a.date, a]));

  return {
    totalSessions,
    totalCards,
    totalCorrect,
    accuracy: totalCards > 0 ? totalCorrect / totalCards : 0,
    totalXp,
    totalMinutes,
    bestStreak,
    bestScore,
    level: levelFromXp(totalXp),
    streak: computeStreak(activityByDay, now),
    activity,
    perDeck: buildDeckPerformance(sessions),
  };
}

export function toSessionSummary(session: StudySession): SessionSummary {
  return {
    id: session.id,
    deckId: session.deckId,
    deckTitle: session.deckTitle,
    mode: session.settings.mode,
    answered: session.score.answered,
    correct: session.score.correct,
    accuracy: session.score.accuracy,
    finalScore: session.score.finalScore,
    xp: session.score.xp,
    letter: session.score.letter,
    maxStreak: session.score.maxStreak,
    durationMs: session.durationMs,
    endedAt: session.endedAt ?? new Date().toISOString(),
  };
}

const ACHIEVEMENT_DEFS: Array<{
  id: string;
  name: string;
  description: string;
  icon: string;
  target: (stats: OverallStats) => number;
  goal: number;
}> = [
  { id: 'first_session', name: 'First Steps', description: 'Complete your first study session.', icon: '🎬', target: (s) => s.totalSessions, goal: 1 },
  { id: 'century', name: 'Century', description: 'Answer 100 cards.', icon: '💯', target: (s) => s.totalCards, goal: 100 },
  { id: 'week_streak', name: 'On a Roll', description: 'Hit a 7-day streak.', icon: '🔥', target: (s) => s.streak.longest, goal: 7 },
  { id: 'month_streak', name: 'Unstoppable', description: 'Hit a 30-day streak.', icon: '🏆', target: (s) => s.streak.longest, goal: 30 },
  { id: 'sharp_shooter', name: 'Sharpshooter', description: 'Finish a session at 100% accuracy.', icon: '🎯', target: (s) => (s.bestScore > 0 ? 1 : 0), goal: 1 },
  { id: 'level_5', name: 'Leveling Up', description: 'Reach level 5.', icon: '⭐', target: (s) => s.level.level, goal: 5 },
  { id: 'level_10', name: 'Scholar', description: 'Reach level 10.', icon: '🌟', target: (s) => s.level.level, goal: 10 },
];

export function computeAchievements(stats: OverallStats): Achievement[] {
  return ACHIEVEMENT_DEFS.map((def) => {
    const value = def.target(stats);
    return {
      id: def.id,
      name: def.name,
      description: def.description,
      icon: def.icon,
      unlocked: value >= def.goal,
      progress: Math.min(1, value / def.goal),
    };
  });
}
