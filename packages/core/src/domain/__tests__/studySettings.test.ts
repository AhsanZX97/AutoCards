import { describe, expect, it } from 'vitest';
import { applyModePreset, createDefaultStudySettings } from '../studySettings';

describe('applyModePreset', () => {
  it('turns the timer on for timed drill', () => {
    const settings = applyModePreset(createDefaultStudySettings(), 'timed');
    expect(settings.mode).toBe('timed');
    expect(settings.timer.enabled).toBe(true);
  });

  it('turns the timer back off when returning to classic', () => {
    const timed = applyModePreset(createDefaultStudySettings(), 'timed');
    const classic = applyModePreset(timed, 'classic');
    expect(classic.mode).toBe('classic');
    expect(classic.timer.enabled).toBe(false);
  });

  it('restores the default grading scale when leaving exam mode', () => {
    const exam = applyModePreset(createDefaultStudySettings(), 'exam');
    expect(exam.gradingScale).toBe('binary');
    expect(exam.timer.perCardSeconds).toBe(45);

    const classic = applyModePreset(exam, 'classic');
    expect(classic.gradingScale).toBe(createDefaultStudySettings().gradingScale);
    expect(classic.timer.enabled).toBe(false);
    expect(classic.timer.perCardSeconds).toBe(createDefaultStudySettings().timer.perCardSeconds);
  });

  it('restores the default shuffle when leaving cram mode', () => {
    const cram = applyModePreset({ ...createDefaultStudySettings(), shuffle: 'none' }, 'cram');
    expect(cram.shuffle).toBe('weakest-first');
    expect(applyModePreset(cram, 'classic').shuffle).toBe(createDefaultStudySettings().shuffle);
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
    const classic = applyModePreset(survival, 'classic');

    expect(classic.reversed).toBe(true);
    expect(classic.sound).toBe(false);
    expect(classic.filters.cardLimit).toBe(25);
    expect(classic.filters.starredOnly).toBe(true);
    expect(classic.timer.autoAdvance).toBe(false);
  });

  it('does not accumulate presets when hopping between modes', () => {
    let settings = createDefaultStudySettings();
    for (const mode of ['timed', 'exam', 'survival', 'cram', 'classic'] as const) {
      settings = applyModePreset(settings, mode);
    }
    const defaults = createDefaultStudySettings();
    expect(settings).toEqual(defaults);
  });

  it('does not mutate the settings it is given', () => {
    const settings = createDefaultStudySettings();
    applyModePreset(settings, 'exam');
    expect(settings.timer.enabled).toBe(false);
    expect(settings.mode).toBe('classic');
  });
});
