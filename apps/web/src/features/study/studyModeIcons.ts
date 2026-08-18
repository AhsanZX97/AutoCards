import type { StudyMode } from '@autocards/core';

/** Icons only — the label and description come from the `studyMode.*` catalog keys instead. */
export const STUDY_MODE_ICONS: Record<StudyMode, string> = {
  timed: '⏱️',
  exam: '📝',
  cram: '🔁',
  survival: '❤️',
};
