import { checkTypeIn } from '../lib/text';
import type { Flashcard, Grade } from '../types';

export interface GradeResult {
  correct: boolean;
  grade: Grade;
  /** Set for type-in answers that passed via fuzzy matching rather than an exact match. */
  nearMiss?: boolean;
}

/** Maps a boolean correctness result to a four-point grade for the scheduler. */
export function gradeFromCorrectness(correct: boolean, selfReported?: Grade): Grade {
  if (selfReported) return selfReported;
  return correct ? 'good' : 'again';
}

/** Grades the auto-graded card types. Manual-answer types (`basic`, `cloze`, `reversed`) are self-graded via `gradeFromCorrectness`. */
export function autoGrade(card: Flashcard, response: string): GradeResult {
  switch (card.type) {
    case 'multiple-choice':
    case 'true-false': {
      const choice = card.choices?.find((c) => c.id === response);
      const correct = choice?.correct ?? false;
      return { correct, grade: gradeFromCorrectness(correct) };
    }
    case 'type-in': {
      const verdict = checkTypeIn(response, card.acceptedAnswers ?? [card.back]);
      return { correct: verdict.correct, grade: gradeFromCorrectness(verdict.correct), nearMiss: verdict.nearMiss };
    }
    default:
      throw new Error(`${card.type} cards are self-graded, not auto-graded`);
  }
}
