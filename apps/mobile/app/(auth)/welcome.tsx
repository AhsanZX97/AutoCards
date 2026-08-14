import { Image, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../../src/components';
import { spacing } from '../../src/lib/theme';

/*
 * The landing screen for anyone signed out. It reuses the native splash
 * artwork so a cold start reads as one continuous screen: the splash appears,
 * then the same picture stays put and the two entry points appear on top of it.
 *
 * The artwork takes the whole screen and the buttons float over its empty
 * lower third, rather than sitting in a row beneath it — otherwise the image
 * reads as a panel with the controls parked underneath.
 *
 * `contain` keeps the wordmark uncropped on every aspect ratio, which leaves
 * hairline bars at the sides. They are invisible because the background below
 * is the artwork's own edge colour — plain white, not the app's slate-50, which
 * is what made the image look like a pasted-on rectangle.
 *
 * The artwork is light-only, so this screen pins that white rather than
 * following the theme — a dark page behind a white image reads as a bug.
 */
const SPLASH_BG = '#ffffff';

export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />

      <Image source={require('../../assets/splash.png')} style={styles.art} resizeMode="contain" />

      <View style={[styles.actions, { paddingBottom: insets.bottom + spacing.xl }]}>
        <Button title="Create account" size="lg" onPress={() => router.push('/(auth)/sign-up')} />
        <Button title="Sign in" variant="outline" size="lg" onPress={() => router.push('/(auth)/sign-in')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SPLASH_BG },
  // The only in-flow child, so it measures to the full screen.
  art: { flex: 1, width: '100%' },
  actions: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
});
