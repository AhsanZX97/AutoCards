import { useEffect, useState } from 'react';
import { useApp } from './appContext';

/**
 * Waits for the persisted auth store to finish hydrating from AsyncStorage
 * before trusting `status`. The persist middleware reads storage
 * asynchronously, so on first mount `session` can still be null even when a
 * session was saved — routing on that would sign the user out on every
 * cold start.
 */
export function useAuthGate() {
  const app = useApp();
  const status = app.authStore((s) => s.status);
  const restore = app.authStore((s) => s.restore);
  const [hydrated, setHydrated] = useState(() => app.authStore.persist.hasHydrated());

  useEffect(() => {
    if (app.authStore.persist.hasHydrated()) {
      setHydrated(true);
      return undefined;
    }
    return app.authStore.persist.onFinishHydration(() => setHydrated(true));
  }, [app]);

  useEffect(() => {
    if (hydrated && status === 'idle') void restore();
  }, [hydrated, status, restore]);

  const ready = hydrated && status !== 'idle' && status !== 'restoring';
  return { ready, status };
}
