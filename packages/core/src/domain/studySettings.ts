import { DEFAULT_FILTERS } from './studyQueue';
import type { GradingScale, ShuffleMode, StudyMode, StudySettings, TimerSettings } from '../types';

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

/** The settings a mode forces. Anything not listed here stays under the learner's control. */
export interface ModePreset {
  timer?: Partial<TimerSettings>;
  shuffle?: ShuffleMode;
  gradingScale?: GradingScale;
}

export const MODE_PRESETS: Record<StudyMode, ModePreset> = {
  classic: {},
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
 * mode's overrides on top. Without the undo step, presets accumulate: picking Timed then Classic
 * would leave the timer running.
 */
export function applyModePreset(settings: StudySettings, mode: StudyMode): StudySettings {
  const defaults = createDefaultStudySettings();
  const { timer: outgoingTimer, ...outgoing } = MODE_PRESETS[settings.mode] ?? {};
  const { timer: incomingTimer, ...incoming } = MODE_PRESETS[mode] ?? {};

  return {
    ...revertForced(settings, outgoing, defaults),
    ...incoming,
    mode,
    timer: { ...revertForced(settings.timer, outgoingTimer, defaults.timer), ...incomingTimer },
  };
}
