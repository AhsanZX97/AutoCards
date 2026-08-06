import { ActivityIndicator, View } from 'react-native';
import { Redirect, Stack } from 'expo-router';
import { useAuthGate } from '../../src/lib/useAuthGate';
import { useTheme } from '../../src/lib/theme';

export default function StudyLayout() {
  const { ready, status } = useAuthGate();
  const theme = useTheme();

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.bg }}>
        <ActivityIndicator color={theme.primary} />
      </View>
    );
  }
  if (status !== 'authenticated') return <Redirect href="/(auth)/sign-in" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
