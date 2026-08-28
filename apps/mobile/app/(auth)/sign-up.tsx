import { useState } from 'react';
import { Image, Text, View } from 'react-native';
import { Link, router } from 'expo-router';
import * as Linking from 'expo-linking';
import { MIN_PASSWORD_LENGTH } from '@autocards/core';
import { useApp } from '../../src/lib/appContext';
import { useGoogleSignIn } from '../../src/lib/useGoogleSignIn';
import { useT } from '../../src/lib/i18n';
import { useTheme, spacing } from '../../src/lib/theme';
import { Button, Field, GoogleButton, OrDivider, Screen } from '../../src/components';

export default function SignUpScreen() {
  const app = useApp();
  const t = useT();
  const theme = useTheme();
  const signUp = app.authStore((s) => s.signUp);
  const status = app.authStore((s) => s.status);
  const error = app.authStore((s) => s.error);
  const errorField = app.authStore((s) => s.errorField);
  const pendingEmail = app.authStore((s) => s.pendingConfirmationEmail);
  const google = useGoogleSignIn();

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  async function onSubmit() {
    // Confirmation is required for a password sign-up (Google skips it — see
    // `AuthService.signInWithGoogle`), and the link has to land back in the
    // app rather than on the website's root, which is what an omitted
    // `redirectTo` would fall back to.
    const ok = await signUp({ username, email, password }, Linking.createURL('callback'));
    // Through `/` rather than straight to `/(app)` so the root redirect gets
    // a chance to send a first-time sign-up to onboarding first.
    if (ok) router.replace('/');
  }

  if (pendingEmail) {
    return (
      <Screen>
        <View style={{ marginTop: spacing.xl, alignItems: 'center' }}>
          <Text style={{ fontSize: 40 }}>✉️</Text>
          <Text style={{ fontSize: 24, fontWeight: '800', color: theme.text, marginTop: spacing.md, textAlign: 'center' }}>
            {t('auth.signUp.checkEmailTitle')}
          </Text>
          <Text style={{ fontSize: 15, color: theme.textMuted, marginTop: spacing.md, textAlign: 'center', lineHeight: 22 }}>
            {t('auth.signUp.checkEmailBody', { email: pendingEmail })}
          </Text>
          <Link href="/(auth)/sign-in" style={{ marginTop: spacing.xl }}>
            <Text style={{ color: theme.primaryText, fontWeight: '700', fontSize: 16 }}>{t('auth.signUp.goToSignIn')}</Text>
          </Link>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={{ marginBottom: spacing.xl, marginTop: spacing.xl }}>
        <Image source={require('../../assets/favicon.png')} style={{ width: 40, height: 40, borderRadius: 10 }} />
        <Text style={{ fontSize: 26, fontWeight: '800', color: theme.text, marginTop: spacing.md }}>
          {t('auth.signUp.title')}
        </Text>
        <Text style={{ fontSize: 15, color: theme.textMuted, marginTop: 4 }}>
          {t('auth.signUp.subtitle')}
        </Text>
      </View>

      <GoogleButton title={t('auth.signUp.google')} onPress={() => void google.start()} loading={google.loading} />
      <OrDivider />

      <Field
        label={t('common.username')}
        hint={t('auth.signUp.usernameHint')}
        placeholder="alex_rivera"
        autoCapitalize="none"
        autoCorrect={false}
        value={username}
        onChangeText={setUsername}
        error={errorField === 'name' ? error ?? undefined : undefined}
      />
      <Field
        label={t('common.email')}
        placeholder={t('auth.emailPlaceholder')}
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        error={errorField === 'email' ? error ?? undefined : undefined}
      />
      <Field
        label={t('common.password')}
        hint={t('auth.signUp.passwordHint', { min: MIN_PASSWORD_LENGTH })}
        placeholder="••••••••"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        error={errorField === 'password' ? error ?? undefined : undefined}
      />
      {error && !errorField && <Text style={{ color: theme.danger, marginBottom: spacing.md }}>{error}</Text>}

      <Button title={t('auth.signUp.submit')} onPress={onSubmit} loading={status === 'loading'} style={{ marginTop: spacing.sm }} />

      <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: spacing.xl }}>
        <Text style={{ color: theme.textMuted }}>{t('auth.signUp.hasAccount')} </Text>
        <Link href="/(auth)/sign-in">
          <Text style={{ color: theme.primaryText, fontWeight: '700' }}>{t('auth.signUp.signInLink')}</Text>
        </Link>
      </View>
    </Screen>
  );
}
