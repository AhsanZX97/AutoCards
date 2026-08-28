import { ActivityIndicator, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuthGate } from '../src/lib/useAuthGate';
import { useOnboardingGate } from '../src/lib/useOnboardingGate';
import { useTheme } from '../src/lib/theme';

export default function Index() {
  const { ready, status } = useAuthGate();
  const onboarding = useOnboardingGate();
  const theme = useTheme();

  const authenticated = status === 'authenticated';
  // Onboarding only needs to hydrate for a signed-in user — a signed-out one
  // is heading to `/welcome` regardless of whether it has been seen.
  if (!ready || (authenticated && !onboarding.ready)) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.bg }}>
        <ActivityIndicator color={theme.primary} />
      </View>
    );
  }

  if (!authenticated) return <Redirect href="/(auth)/welcome" />;
  if (!onboarding.hasSeenOnboarding) return <Redirect href="/onboarding" />;
  return <Redirect href="/(app)" />;
}
