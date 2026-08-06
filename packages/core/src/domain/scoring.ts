import { DIFFICULTY_WEIGHT } from '../types';
import type { CardAnswer, Flashcard, LetterGrade, ScoreBreakdown, StudySettings } from '../types';

const BASE_POINTS = 100;
/** Answers faster than this earn the full speed bonus; scales to zero by `SPEED_FLOOR_MS`. */
const SPEED_CEILING_MS = 3_000;
const SPEED_FLOOR_MS = 15_000;
const MAX_SPEED_BONUS = 40;
/** Streak bonus per consecutive correct answer, capped. */
const STREAK_BONUS_PER_CARD = 8;
const MAX_STREAK_BONUS = 120;
const HINT_PENALTY = 15;
const TIMEOUT_PENALTY = 30;

export function emptyScore(): ScoreBreakdown {
  return {
    answered: 0,
    correct: 0,
    accuracy: 0,
    basePoints: 0,
    difficultyBonus: 0,
    speedBonus: 0,
    streakBonus: 0,
    hintPenalty: 0,
    timeoutPenalty: 0,
    finalScore: 0,
    maxStreak: 0,
    averageTimeMs: 0,
    xp: 0,
    letter: 'F',
  };
}

function speedBonusFor(timeMs: number): number {
  if (timeMs <= SPEED_CEILING_MS) return MAX_SPEED_BONUS;
  if (timeMs >= SPEED_FLOOR_MS) return 0;
  const t = 1 - (timeMs - SPEED_CEILING_MS) / (SPEED_FLOOR_MS - SPEED_CEILING_MS);
  return Math.round(MAX_SPEED_BONUS * t);
}

function letterFor(accuracy: number, answered: number): LetterGrade {
  if (answered === 0) return 'F';
  if (accuracy >= 0.97) return 'S';
  if (accuracy >= 0.9) return 'A';
  if (accuracy >= 0.8) return 'B';
  if (accuracy >= 0.7) return 'C';
  if (accuracy >= 0.5) return 'D';
  return 'F';
}

/**
 * Recomputes the full score from a session's answer log. Pure and order-
 * dependent only on `answers`, so it can be called after every card without
 * drifting from a from-scratch recompute — there's no incremental state to
 * keep in sync.
 */
export function computeScore(
  answers: readonly CardAnswer[],
  cardsById: ReadonlyMap<string, Flashcard>,
  settings: Pick<StudySettings, 'streakBonus' | 'speedBonus' | 'hintPenalty'>,
): ScoreBreakdown {
  if (answers.length === 0) return emptyScore();

  let basePoints = 0;
  let difficultyBonus = 0;
  let speedBonus = 0;
  let streakBonus = 0;
  let hintPenalty = 0;
  let timeoutPenalty = 0;
  let correct = 0;
  let streak = 0;
  let maxStreak = 0;
  let totalTime = 0;

  for (const answer of answers) {
    totalTime += answer.timeMs;
    const card = cardsById.get(answer.cardId);
    const weight = card ? DIFFICULTY_WEIGHT[card.difficulty] : 1;

    if (answer.correct) {
      correct += 1;
      streak += 1;
      maxStreak = Math.max(maxStreak, streak);

      const points = BASE_POINTS * weight;
      basePoints += BASE_POINTS;
      difficultyBonus += points - BASE_POINTS;

      if (settings.speedBonus && !answer.timedOut) {
        speedBonus += speedBonusFor(answer.timeMs);
      }
      if (settings.streakBonus) {
        streakBonus += Math.min(STREAK_BONUS_PER_CARD * (streak - 1), MAX_STREAK_BONUS);
      }
    } else {
      streak = 0;
    }

    if (settings.hintPenalty && answer.usedHint) {
      hintPenalty += HINT_PENALTY;
    }
    if (answer.timedOut) {
      timeoutPenalty += TIMEOUT_PENALTY;
    }
  }

  const finalScore = Math.max(
    0,
    Math.round(basePoints + difficultyBonus + speedBonus + streakBonus - hintPenalty - timeoutPenalty),
  );
  const accuracy = correct / answers.length;

  return {
    answered: answers.length,
    correct,
    accuracy,
    basePoints: Math.round(basePoints),
    difficultyBonus: Math.round(difficultyBonus),
    speedBonus: Math.round(speedBonus),
    streakBonus: Math.round(streakBonus),
    hintPenalty: Math.round(hintPenalty),
    timeoutPenalty: Math.round(timeoutPenalty),
    finalScore,
    maxStreak,
    averageTimeMs: Math.round(totalTime / answers.length),
    xp: Math.round(finalScore * 0.5 + correct * 5),
    letter: letterFor(accuracy, answers.length),
  };
}
