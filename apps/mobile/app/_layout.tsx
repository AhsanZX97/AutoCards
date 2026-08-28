import { View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
import { Toaster } from '../src/components/Toaster';
import { AppProvider } from '../src/lib/appContext';
import { ThemeProvider, useResolvedScheme, useTheme } from '../src/lib/theme';

function ThemedNavigator() {
  const scheme = useResolvedScheme();
  const theme = useTheme();

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.bg } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="(app)" />
        <Stack.Screen name="study" />
      </Stack>
      <Toaster />
    </View>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      {/* Outside AppProvider so it still catches a failure in the provider
          itself, which is exactly when the screen would otherwise be blank. */}
      <ErrorBoundary>
        <AppProvider>
          <ThemeProvider>
            <ThemedNavigator />
          </ThemeProvider>
        </AppProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
