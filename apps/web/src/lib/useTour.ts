import { useCallback, useEffect, useState } from 'react';
import type { TourId } from '@autocards/core';
import { useApp } from './appContext';

/**
 * Whether a screen's walkthrough should be running, and how to put it away.
 *
 * Waits for the persisted store to hydrate first: the middleware reads storage
 * asynchronously, so on the first render nothing looks completed yet and a
 * returning learner would get a flash of the tour they already finished.
 *
 * `enabled` is for the data the tour talks about — pass false until the deck
 * has loaded, or the first step lands on a screen that says "Deck not found".
 */
export function useTour(id: TourId, enabled = true) {
  const app = useApp();
  const completedTours = app.tourStore((s) => s.completedTours);
  const completeTour = app.tourStore((s) => s.completeTour);
  const [hydrated, setHydrated] = useState(() => app.tourStore.persist.hasHydrated());

  useEffect(() => {
    if (app.tourStore.persist.hasHydrated()) {
      setHydrated(true);
      return undefined;
    }
    return app.tourStore.persist.onFinishHydration(() => setHydrated(true));
  }, [app]);

  const finish = useCallback(() => completeTour(id), [completeTour, id]);

  return { open: hydrated && enabled && !completedTours.includes(id), finish };
}
