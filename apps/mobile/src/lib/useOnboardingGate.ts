import { useEffect, useState } from 'react';
import { useApp } from './appContext';

/**
 * Waits for the persisted onboarding store to finish hydrating from
 * AsyncStorage before trusting `hasSeenOnboarding`. Same reasoning as
 * `useAuthGate`: reading it before hydration lands would show the
 * first-login walkthrough again on every cold start.
 */
export function useOnboardingGate() {
  const app = useApp();
  const hasSeenOnboarding = app.onboardingStore((s) => s.hasSeenOnboarding);
  const [hydrated, setHydrated] = useState(() => app.onboardingStore.persist.hasHydrated());

  useEffect(() => {
    if (app.onboardingStore.persist.hasHydrated()) {
      setHydrated(true);
      return undefined;
    }
    return app.onboardingStore.persist.onFinishHydration(() => setHydrated(true));
  }, [app]);

  return { ready: hydrated, hasSeenOnboarding };
}
