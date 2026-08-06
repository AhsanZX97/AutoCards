import { ActivityIndicator, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuthGate } from '../src/lib/useAuthGate';
import { useTheme } from '../src/lib/theme';

export default function Index() {
  const { ready, status } = useAuthGate();
  const theme = useTheme();

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.bg }}>
        <ActivityIndicator color={theme.primary} />
      </View>
    );
  }

  return <Redirect href={status === 'authenticated' ? '/(app)' : '/(auth)/sign-in'} />;
}
