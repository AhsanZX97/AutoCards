import { describe, expect, it } from 'vitest';
import { applyModePreset, createDefaultStudySettings, normalizeStudySettings } from '../studySettings';
import { STUDY_MODES } from '../../types';
import type { StudySettings } from '../../types';

describe('createDefaultStudySettings', () => {
  it('defaults to a mode that still exists', () => {
    expect(STUDY_MODES).toContain(createDefaultStudySettings().mode);
  });

  it('already has the default mode preset applied', () => {
    const defaults = createDefaultStudySettings();
    expect(applyModePreset(defaults, defaults.mode)).toEqual(defaults);
  });
});

describe('applyModePreset', () => {
  it('turns the timer on for timed drill', () => {
    const settings = applyModePreset(createDefaultStudySettings(), 'timed');
    expect(settings.mode).toBe('timed');
    expect(settings.timer.enabled).toBe(true);
  });

  it('turns the timer back off when leaving timed drill', () => {
    const timed = applyModePreset(createDefaultStudySettings(), 'timed');
    const cram = applyModePreset(timed, 'cram');
    expect(cram.mode).toBe('cram');
    expect(cram.timer.enabled).toBe(false);
  });

  it('restores the default grading scale when leaving exam mode', () => {
    const exam = applyModePreset(createDefaultStudySettings(), 'exam');
    expect(exam.gradingScale).toBe('binary');
    expect(exam.timer.perCardSeconds).toBe(45);

    const cram = applyModePreset(exam, 'cram');
    expect(cram.gradingScale).toBe(createDefaultStudySettings().gradingScale);
    expect(cram.timer.enabled).toBe(false);
    expect(cram.timer.perCardSeconds).toBe(createDefaultStudySettings().timer.perCardSeconds);
  });

  it('forces random ordering in cram mode', () => {
    const cram = applyModePreset({ ...createDefaultStudySettings(), shuffle: 'none' }, 'cram');
    expect(cram.shuffle).toBe('random');
  });

  it('restores the neutral shuffle when leaving cram mode', () => {
    const cram = applyModePreset({ ...createDefaultStudySettings(), shuffle: 'none' }, 'cram');
    expect(applyModePreset(cram, 'timed').shuffle).toBe('random');
  });

  it('keeps settings the mode does not control', () => {
    const base = createDefaultStudySettings();
    const tweaked = {
      ...base,
      reversed: true,
      sound: false,
      filters: { ...base.filters, cardLimit: 25, starredOnly: true },
      timer: { ...base.timer, autoAdvance: false },
    };

    const survival = applyModePreset(tweaked, 'survival');
    const timed = applyModePreset(survival, 'timed');

    expect(timed.reversed).toBe(true);
    expect(timed.sound).toBe(false);
    expect(timed.filters.cardLimit).toBe(25);
    expect(timed.filters.starredOnly).toBe(true);
    expect(timed.timer.autoAdvance).toBe(false);
  });

  it('does not accumulate presets when hopping between modes', () => {
    const defaults = createDefaultStudySettings();
    let settings = defaults;
    for (const mode of ['timed', 'exam', 'survival', 'cram'] as const) {
      settings = applyModePreset(settings, mode);
    }
    expect(settings).toEqual(defaults);
  });

  it('does not mutate the settings it is given', () => {
    const settings = createDefaultStudySettings();
    const before = structuredClone(settings);
    applyModePreset(settings, 'exam');
    expect(settings).toEqual(before);
  });
});

describe('normalizeStudySettings', () => {
  // Decks saved before Classic was retired still carry `mode: 'classic'` in
  // local storage and in already-shared deck exports.
  const legacy = {
    ...createDefaultStudySettings(),
    mode: 'classic',
    reversed: true,
    filters: { ...createDefaultStudySettings().filters, cardLimit: 30 },
  } as unknown as StudySettings;

  it('moves a retired mode onto the current default', () => {
    expect(normalizeStudySettings(legacy).mode).toBe(createDefaultStudySettings().mode);
  });

  it('keeps the settings the retired mode did not control', () => {
    const normalized = normalizeStudySettings(legacy);
    expect(normalized.reversed).toBe(true);
    expect(normalized.filters.cardLimit).toBe(30);
  });

  it('leaves a still-valid mode alone', () => {
    const exam = applyModePreset(createDefaultStudySettings(), 'exam');
    expect(normalizeStudySettings(exam)).toEqual(exam);
  });

  // Decks created while Cram forced weakest-first carry that ordering in storage
  // forever — nothing rewrites a deck's saved settings after it is created.
  it('re-applies the mode preset to settings saved under an older one', () => {
    const stale = { ...createDefaultStudySettings(), mode: 'cram', shuffle: 'weakest-first' } as StudySettings;
    expect(normalizeStudySettings(stale).shuffle).toBe('random');
  });

  it('keeps the settings the current mode does not force', () => {
    const stale = {
      ...createDefaultStudySettings(),
      mode: 'cram',
      shuffle: 'weakest-first',
      reversed: true,
      sound: false,
    } as StudySettings;
    const normalized = normalizeStudySettings(stale);
    expect(normalized.reversed).toBe(true);
    expect(normalized.sound).toBe(false);
  });
});
