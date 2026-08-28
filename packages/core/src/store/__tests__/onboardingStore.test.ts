import { describe, expect, it } from 'vitest';
import { createMemoryStorage } from '../../lib/storage';
import { createOnboardingStore } from '../onboardingStore';

function setup() {
  return createOnboardingStore(createMemoryStorage());
}

describe('createOnboardingStore', () => {
  it('has not seen onboarding for a brand new user', () => {
    const store = setup();
    expect(store.getState().hasSeenOnboarding).toBe(false);
  });

  it('marks onboarding seen once completed', () => {
    const store = setup();
    store.getState().completeOnboarding();
    expect(store.getState().hasSeenOnboarding).toBe(true);
  });

  it('stays seen when completed twice', () => {
    const store = setup();
    store.getState().completeOnboarding();
    store.getState().completeOnboarding();
    expect(store.getState().hasSeenOnboarding).toBe(true);
  });

  it('makes onboarding run again after a reset', () => {
    const store = setup();
    store.getState().completeOnboarding();
    store.getState().resetOnboarding();
    expect(store.getState().hasSeenOnboarding).toBe(false);
  });
});
