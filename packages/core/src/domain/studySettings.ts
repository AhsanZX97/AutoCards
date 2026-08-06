import { DEFAULT_FILTERS } from './studyQueue';
import type { StudySettings } from '../types';

export const DEFAULT_TIMER_SETTINGS: StudySettings['timer'] = {
  enabled: false,
  perCardSeconds: 20,
  totalSeconds: 0,
  autoAdvance: true,
  showAsBar: true,
};

export function createDefaultStudySettings(): StudySettings {
  return {
    mode: 'classic',
    shuffle: 'random',
    reversed: false,
    gradingScale: 'four-point',
    timer: { ...DEFAULT_TIMER_SETTINGS },
    filters: { ...DEFAULT_FILTERS },
    streakBonus: true,
    speedBonus: true,
    hintPenalty: true,
    readAloud: false,
    sound: true,
  };
}

/** Per-mode overrides applied on top of the deck/global defaults. */
export function applyModePreset(settings: StudySettings): StudySettings {
  switch (settings.mode) {
    case 'timed':
      return { ...settings, timer: { ...settings.timer, enabled: true } };
    case 'exam':
      return {
        ...settings,
        timer: { ...settings.timer, enabled: true, perCardSeconds: 45 },
        gradingScale: 'binary',
      };
    case 'cram':
      return { ...settings, shuffle: 'weakest-first' };
    case 'spaced':
      return {
        ...settings,
        shuffle: 'due-first',
        filters: { ...settings.filters, dueOnly: true },
      };
    case 'survival':
      return { ...settings, timer: { ...settings.timer, enabled: true, perCardSeconds: 15 } };
    default:
      return settings;
  }
}
