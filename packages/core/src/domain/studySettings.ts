import { DEFAULT_FILTERS } from './studyQueue';
import { STUDY_MODES } from '../types';
import type { GradingScale, ShuffleMode, StudyMode, StudySettings, TimerSettings } from '../types';

export const DEFAULT_TIMER_SETTINGS: StudySettings['timer'] = {
  enabled: false,
  perCardSeconds: 20,
  totalSeconds: 0,
  autoAdvance: true,
  showAsBar: true,
};

/** The mode a deck starts on. Every mode forces something, so this one is
 *  picked for being the mildest: no clock, no lives, no forced grading scale. */
export const DEFAULT_STUDY_MODE: StudyMode = 'cram';

/**
 * The neutral baseline every preset layers on top of, and the values
 * `applyModePreset` puts back when a mode stops forcing something.
 *
 * Kept separate from `createDefaultStudySettings` on purpose: the default mode
 * carries a preset of its own, and if modes reverted to *that* they could never
 * undo it — leaving Cram, for instance, would restore Cram's own shuffle.
 */
function neutralSettings(mode: StudyMode): StudySettings {
  return {
    mode,
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

export function createDefaultStudySettings(): StudySettings {
  return applyModePreset(neutralSettings(DEFAULT_STUDY_MODE), DEFAULT_STUDY_MODE);
}

/**
 * Repairs settings whose mode no longer exists — decks saved or shared before a
 * mode was retired still carry it. Everything the retired mode did not control
 * is kept; only the mode itself and whatever the new mode forces change.
 */
export function normalizeStudySettings(settings: StudySettings): StudySettings {
  if (STUDY_MODES.includes(settings.mode)) return settings;
  return applyModePreset({ ...settings, mode: DEFAULT_STUDY_MODE }, DEFAULT_STUDY_MODE);
}

/** The settings a mode forces. Anything not listed here stays under the learner's control. */
export interface ModePreset {
  timer?: Partial<TimerSettings>;
  shuffle?: ShuffleMode;
  gradingScale?: GradingScale;
}

export const MODE_PRESETS: Record<StudyMode, ModePreset> = {
  timed: { timer: { enabled: true } },
  exam: { timer: { enabled: true, perCardSeconds: 45 }, gradingScale: 'binary' },
  cram: { shuffle: 'weakest-first' },
  survival: { timer: { enabled: true, perCardSeconds: 15 } },
};

/** Put back the defaults for every key the outgoing mode had forced. */
function revertForced<T extends object>(current: T, forced: Partial<T> | undefined, defaults: T): T {
  if (!forced) return current;
  const out = { ...current };
  for (const key of Object.keys(forced) as (keyof T)[]) out[key] = defaults[key];
  return out;
}

/**
 * Switch `settings` to `mode`, undoing whatever the previous mode forced before layering the new
 * mode's overrides on top. Without the undo step, presets accumulate: picking Timed then Cram
 * would leave the timer running.
 */
export function applyModePreset(settings: StudySettings, mode: StudyMode): StudySettings {
  const defaults = neutralSettings(mode);
  const { timer: outgoingTimer, ...outgoing } = MODE_PRESETS[settings.mode] ?? {};
  const { timer: incomingTimer, ...incoming } = MODE_PRESETS[mode] ?? {};

  return {
    ...revertForced(settings, outgoing, defaults),
    ...incoming,
    mode,
    timer: { ...revertForced(settings.timer, outgoingTimer, defaults.timer), ...incomingTimer },
  };
}
