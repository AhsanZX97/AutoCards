import { describe, expect, it } from 'vitest';
import { createMemoryStorage } from '../../lib/storage';
import { createSettingsStore } from '../settingsStore';

describe('createSettingsStore', () => {
  it('does not include hints or explanations in new deck defaults', () => {
    const defaults = createSettingsStore(createMemoryStorage()).getState().generationDefaults;

    expect(defaults.includeHints).toBe(false);
    expect(defaults.includeExplanations).toBe(false);
  });
});
