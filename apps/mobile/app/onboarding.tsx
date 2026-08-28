import { router } from 'expo-router';
import { useApp } from '../src/lib/appContext';
import { OnboardingCarousel } from '../src/features/onboarding/OnboardingCarousel';

export default function OnboardingScreen() {
  const app = useApp();

  function finish() {
    app.onboardingStore.getState().completeOnboarding();
    router.replace('/(app)');
  }

  return <OnboardingCarousel onDone={finish} />;
}
