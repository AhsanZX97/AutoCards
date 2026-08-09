import { describe, expect, it } from 'vitest';
import { createMemoryStorage } from '../../lib/storage';
import { createTourStore } from '../tourStore';

function setup() {
  return createTourStore(createMemoryStorage());
}

describe('createTourStore.hasSeenTour', () => {
  it('reports every tour as unseen for a brand new user', () => {
    const store = setup();
    expect(store.getState().hasSeenTour('deck-detail')).toBe(false);
    expect(store.getState().hasSeenTour('study-setup')).toBe(false);
  });

  it('reports a tour as seen once it has been completed', () => {
    const store = setup();
    store.getState().completeTour('deck-detail');
    expect(store.getState().hasSeenTour('deck-detail')).toBe(true);
  });

  it('leaves the other tours unseen when one is completed', () => {
    const store = setup();
    store.getState().completeTour('deck-detail');
    expect(store.getState().hasSeenTour('study-setup')).toBe(false);
  });
});

describe('createTourStore.completeTour', () => {
  it('records the tour only once when it is completed twice', () => {
    const store = setup();
    store.getState().completeTour('deck-detail');
    store.getState().completeTour('deck-detail');
    expect(store.getState().completedTours).toEqual(['deck-detail']);
  });

  it('keeps tours already completed when another finishes', () => {
    const store = setup();
    store.getState().completeTour('deck-detail');
    store.getState().completeTour('study-setup');
    expect(store.getState().completedTours).toEqual(['deck-detail', 'study-setup']);
  });
});

describe('createTourStore.resetTours', () => {
  it('makes every tour run again', () => {
    const store = setup();
    store.getState().completeTour('deck-detail');
    store.getState().completeTour('study-setup');
    store.getState().resetTours();
    expect(store.getState().completedTours).toEqual([]);
    expect(store.getState().hasSeenTour('deck-detail')).toBe(false);
  });
});
