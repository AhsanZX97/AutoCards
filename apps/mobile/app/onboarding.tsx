import { Platform } from 'react-native';
import { router } from 'expo-router';
import type { Plan } from '@autocards/core';
import { useApp } from '../src/lib/appContext';
import { useT } from '../src/lib/i18n';
import { toast } from '../src/lib/toastStore';
import { useGooglePlayPurchase } from '../src/lib/useGooglePlayPurchase';
import { OnboardingCarousel } from '../src/features/onboarding/OnboardingCarousel';

export default function OnboardingScreen() {
  const app = useApp();
  const t = useT();
  const { buy, loading } = useGooglePlayPurchase();
  const canBuyOnPlay = Platform.OS === 'android' && !!app.services.playBilling;

  function finish() {
    app.onboardingStore.getState().completeOnboarding();
    router.replace('/(app)');
  }

  /**
   * Closes the walkthrough on whichever plan was picked on the last page.
   *
   * Free finishes straight away. A paid plan opens Play's billing sheet — the
   * same `useGooglePlayPurchase` round trip the settings screen runs, so a
   * purchase is still only granted by `verify-play-purchase` server-side.
   * Backing out of that sheet or a failed charge leaves the walkthrough open
   * rather than dropping someone into the app mid-decision; anywhere Play
   * cannot sell (iOS, or a build with no billing service) says so and lets
   * them through on Free, since Settings can still upgrade them later.
   */
  async function handleDone(plan: Plan) {
    if (plan === 'free') {
      finish();
      return;
    }

    if (!canBuyOnPlay) {
      toast({
        variant: 'info',
        title: t('onboarding.plans.upgradeLaterTitle'),
        description: t('onboarding.plans.upgradeLaterBody'),
      });
      finish();
      return;
    }

    try {
      const granted = await buy(plan);
      if (!granted) return;

      toast({
        variant: 'success',
        title: granted === 'lifetime' ? t('settings.billing.lifetimeOwnedTitle') : t('settings.billing.proOwnedTitle'),
        description:
          granted === 'lifetime' ? t('settings.billing.lifetimeOwnedBody') : t('settings.billing.upgradeOwnedBody'),
      });
      finish();
    } catch (error) {
      toast({
        variant: 'error',
        title: t('onboarding.plans.purchaseFailed'),
        description: error instanceof Error ? error.message : t('mobileSettings.tryAgainMoment'),
      });
    }
  }

  return <OnboardingCarousel onDone={(plan) => void handleDone(plan)} busy={loading} />;
}
