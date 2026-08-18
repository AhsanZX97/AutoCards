import { useState } from 'react';
import { Image, Text, View } from 'react-native';
import { Link, router } from 'expo-router';
import { useApp } from '../../src/lib/appContext';
import { useGoogleSignIn } from '../../src/lib/useGoogleSignIn';
import { useT } from '../../src/lib/i18n';
import { useTheme, spacing } from '../../src/lib/theme';
import { Button, Field, GoogleButton, OrDivider, Screen } from '../../src/components';

export default function SignInScreen() {
  const app = useApp();
  const t = useT();
  const theme = useTheme();
  const signIn = app.authStore((s) => s.signIn);
  const status = app.authStore((s) => s.status);
  const error = app.authStore((s) => s.error);
  const errorField = app.authStore((s) => s.errorField);
  const google = useGoogleSignIn();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  async function onSubmit() {
    const ok = await signIn({ email, password });
    if (ok) router.replace('/(app)');
  }

  return (
    <Screen>
      <View style={{ marginBottom: spacing.xl, marginTop: spacing.xl }}>
        <Image source={require('../../assets/favicon.png')} style={{ width: 40, height: 40, borderRadius: 10 }} />
        <Text style={{ fontSize: 26, fontWeight: '800', color: theme.text, marginTop: spacing.md }}>{t('auth.signIn.title')}</Text>
        <Text style={{ fontSize: 15, color: theme.textMuted, marginTop: 4 }}>
          {t('auth.signIn.subtitle')}
        </Text>
      </View>

      <GoogleButton title={t('auth.signIn.google')} onPress={() => void google.start()} loading={google.loading} />
      <OrDivider />

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
        placeholder="••••••••"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        error={errorField === 'password' ? error ?? undefined : undefined}
      />
      {error && !errorField && <Text style={{ color: theme.danger, marginBottom: spacing.md }}>{error}</Text>}

      <View style={{ alignItems: 'flex-end', marginBottom: spacing.md }}>
        <Link href="/(auth)/forgot-password">
          <Text style={{ color: theme.primaryText, fontWeight: '600', fontSize: 14 }}>{t('auth.signIn.forgotPassword')}</Text>
        </Link>
      </View>

      <Button title={t('auth.signIn.submit')} onPress={onSubmit} loading={status === 'loading'} style={{ marginTop: spacing.sm }} />

      <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: spacing.xl }}>
        <Text style={{ color: theme.textMuted }}>{t('auth.signIn.noAccount')} </Text>
        <Link href="/(auth)/sign-up">
          <Text style={{ color: theme.primaryText, fontWeight: '700' }}>{t('auth.signIn.signUpLink')}</Text>
        </Link>
      </View>
    </Screen>
  );
}
