import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Link, router } from 'expo-router';
import { useURL } from 'expo-linking';
import { MIN_PASSWORD_LENGTH } from '@autocards/core';
import { useApp } from '../../src/lib/appContext';
import { useTheme, spacing } from '../../src/lib/theme';
import { Button, Field, Screen } from '../../src/components';
import { toast } from '../../src/lib/toastStore';

/**
 * Where a reset link lands, mirroring web's `ResetPasswordPage`.
 *
 * The link carries a recovery token in `useURL()`'s value rather than the
 * page's own address — there is no window location here — so the first job
 * is exchanging that for a session via `restoreFromUrl` before the form below
 * has anything to act on.
 */
export default function ResetPasswordScreen() {
  const app = useApp();
  const theme = useTheme();
  const url = useURL();

  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Undefined while the exchange is still in flight.
  const [linkUsable, setLinkUsable] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    if (linkUsable !== undefined || !url) return undefined;
    let cancelled = false;
    void (async () => {
      try {
        const session = await app.services.auth.restoreFromUrl(url);
        if (cancelled) return;
        if (session) {
          app.authStore.getState().syncFromProvider(session);
          setLinkUsable(true);
        } else {
          setLinkUsable(false);
        }
      } catch {
        if (!cancelled) setLinkUsable(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [app, url, linkUsable]);

  // Covers both a slow exchange and `useURL()` itself not having resolved
  // yet — it reads the launching URL asynchronously, so it can still be null
  // a moment after this screen mounts.
  useEffect(() => {
    if (linkUsable !== undefined) return undefined;
    const timer = setTimeout(() => setLinkUsable((current) => current ?? false), 4_000);
    return () => clearTimeout(timer);
  }, [linkUsable]);

  async function onSubmit() {
    setError(null);
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirmation) {
      setError('Those two passwords don’t match.');
      return;
    }
    setSaving(true);
    try {
      await app.services.auth.updatePassword(password);
      toast({
        variant: 'success',
        title: 'Password changed',
        description: 'You’re signed in with your new password.',
      });
      router.replace('/(app)');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not set that password.');
    } finally {
      setSaving(false);
    }
  }

  if (linkUsable === false) {
    return (
      <Screen>
        <View style={{ marginTop: spacing.xxl, alignItems: 'center' }}>
          <Text style={{ fontSize: 40 }}>⏳</Text>
          <Text
            style={{
              fontSize: 22,
              fontWeight: '800',
              color: theme.text,
              marginTop: spacing.md,
              textAlign: 'center',
            }}
          >
            This link has expired
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
            Reset links last an hour and can only be used once. Ask for a fresh one and it&apos;ll
            work.
          </Text>
          <Link href="/(auth)/forgot-password" style={{ marginTop: spacing.xl }}>
            <Text style={{ color: theme.primaryText, fontWeight: '700', fontSize: 16 }}>Send a new link</Text>
          </Link>
        </View>
      </Screen>
    );
  }

  if (linkUsable === undefined) {
    return (
      <Screen>
        <View style={{ marginTop: spacing.xxl, alignItems: 'center' }}>
          <Text style={{ color: theme.textMuted }}>Checking your link…</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={{ marginBottom: spacing.xl, marginTop: spacing.xl }}>
        <Text style={{ fontSize: 26, fontWeight: '800', color: theme.text }}>Set a new password</Text>
      </View>

      <Field
        label="New password"
        hint={`${MIN_PASSWORD_LENGTH}+ characters`}
        placeholder="••••••••"
        secureTextEntry
        autoFocus
        value={password}
        onChangeText={setPassword}
      />
      <Field
        label="Confirm new password"
        placeholder="••••••••"
        secureTextEntry
        value={confirmation}
        onChangeText={setConfirmation}
        error={error ?? undefined}
      />

      <Button title="Set new password" onPress={onSubmit} loading={saving} style={{ marginTop: spacing.sm }} />
    </Screen>
  );
}
