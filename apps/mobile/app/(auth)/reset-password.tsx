import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Link, router } from 'expo-router';
import { useURL } from 'expo-linking';
import { MIN_PASSWORD_LENGTH } from '@autocards/core';
import { useApp } from '../../src/lib/appContext';
import { useT } from '../../src/lib/i18n';
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
  const t = useT();
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
      setError(t('auth.resetPassword.tooShort', { min: MIN_PASSWORD_LENGTH }));
      return;
    }
    if (password !== confirmation) {
      setError(t('auth.resetPassword.mismatch'));
      return;
    }
    setSaving(true);
    try {
      await app.services.auth.updatePassword(password);
      toast({
        variant: 'success',
        title: t('auth.resetPassword.successTitle'),
        description: t('auth.resetPassword.successBody'),
      });
      // Through `/` rather than straight to `/(app)` so the root redirect gets
      // a chance to send a first-time login to onboarding first.
      router.replace('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.resetPassword.genericError'));
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
            {t('auth.resetPassword.expiredTitle')}
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
            {t('auth.resetPassword.expiredBody')}
          </Text>
          <Link href="/(auth)/forgot-password" style={{ marginTop: spacing.xl }}>
            <Text style={{ color: theme.primaryText, fontWeight: '700', fontSize: 16 }}>{t('auth.resetPassword.sendNewLink')}</Text>
          </Link>
        </View>
      </Screen>
    );
  }

  if (linkUsable === undefined) {
    return (
      <Screen>
        <View style={{ marginTop: spacing.xxl, alignItems: 'center' }}>
          <Text style={{ color: theme.textMuted }}>{t('auth.resetPassword.checkingLink')}</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={{ marginBottom: spacing.xl, marginTop: spacing.xl }}>
        <Text style={{ fontSize: 26, fontWeight: '800', color: theme.text }}>{t('auth.resetPassword.mobileTitle')}</Text>
      </View>

      <Field
        label={t('auth.resetPassword.newPassword')}
        hint={t('auth.signUp.passwordHint', { min: MIN_PASSWORD_LENGTH })}
        placeholder="••••••••"
        secureTextEntry
        autoFocus
        value={password}
        onChangeText={setPassword}
      />
      <Field
        label={t('auth.resetPassword.confirmPassword')}
        placeholder="••••••••"
        secureTextEntry
        value={confirmation}
        onChangeText={setConfirmation}
        error={error ?? undefined}
      />

      <Button title={t('auth.resetPassword.submit')} onPress={onSubmit} loading={saving} style={{ marginTop: spacing.sm }} />
    </Screen>
  );
}
