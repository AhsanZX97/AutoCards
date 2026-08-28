import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Link, router } from 'expo-router';
import { useURL } from 'expo-linking';
import { useApp } from '../../src/lib/appContext';
import { useT } from '../../src/lib/i18n';
import { useTheme, spacing } from '../../src/lib/theme';
import { Screen } from '../../src/components';

/** Long enough for a slow exchange, short enough not to look like a hang. */
const GIVE_UP_AFTER_MS = 15_000;

/**
 * Where a deep link lands that isn't password recovery — a sign-up
 * confirmation email, or Google's return trip on the rare device where
 * `openAuthSessionAsync` hands off to the OS instead of resolving directly
 * (see `useGoogleSignIn`, which handles the ordinary case itself and never
 * routes here).
 *
 * `useURL()` is the mobile equivalent of the browser handing the landing page
 * its own address — there is no window location to read, so the tokens or
 * code the link carries have to come from the URL Linking hands back instead.
 */
export default function AuthCallbackScreen() {
  const app = useApp();
  const t = useT();
  const theme = useTheme();
  const url = useURL();
  const [outcome, setOutcome] = useState<'pending' | 'failed'>('pending');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!url || outcome !== 'pending') return undefined;
    let cancelled = false;
    void (async () => {
      try {
        const session = await app.services.auth.restoreFromUrl(url);
        if (cancelled) return;
        if (session) {
          app.authStore.getState().syncFromProvider(session);
          // Through `/` rather than straight to `/(app)` so the root redirect gets
          // a chance to send a first-time sign-up to onboarding first.
          router.replace('/');
        } else {
          setOutcome('failed');
        }
      } catch (err) {
        if (cancelled) return;
        setMessage(err instanceof Error ? err.message : null);
        setOutcome('failed');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [app, url, outcome]);

  useEffect(() => {
    if (outcome !== 'pending') return undefined;
    const timer = setTimeout(() => setOutcome('failed'), GIVE_UP_AFTER_MS);
    return () => clearTimeout(timer);
  }, [outcome]);

  if (outcome === 'failed') {
    return (
      <Screen>
        <View style={{ marginTop: spacing.xl, alignItems: 'center' }}>
          <Text style={{ fontSize: 40 }}>⚠️</Text>
          <Text
            style={{
              fontSize: 22,
              fontWeight: '800',
              color: theme.text,
              marginTop: spacing.md,
              textAlign: 'center',
            }}
          >
            {t('auth.callback.failedTitle')}
          </Text>
          <Text
            style={{
              fontSize: 15,
              color: theme.textMuted,
              marginTop: spacing.md,
              textAlign: 'center',
              lineHeight: 22,
            }}
          >
            {message ?? t('auth.callback.timedOut')}
          </Text>
          <Link href="/(auth)/sign-in" style={{ marginTop: spacing.xl }}>
            <Text style={{ color: theme.primaryText, fontWeight: '700', fontSize: 16 }}>{t('auth.callback.backToSignIn')}</Text>
          </Link>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={{ marginTop: spacing.xxl, alignItems: 'center' }}>
        <Text style={{ color: theme.textMuted }}>{t('auth.callback.signingIn')}</Text>
      </View>
    </Screen>
  );
}
