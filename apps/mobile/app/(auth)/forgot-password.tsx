import { useState } from 'react';
import { Text, View } from 'react-native';
import { Link } from 'expo-router';
import * as Linking from 'expo-linking';
import { useApp } from '../../src/lib/appContext';
import { useT } from '../../src/lib/i18n';
import { useTheme, spacing } from '../../src/lib/theme';
import { Button, Field, Screen } from '../../src/components';

/**
 * Asks for the reset email.
 *
 * Always reports the same thing back, whether or not that address has an
 * account — see `requestPasswordReset`. The confirmation is worded so it reads
 * naturally either way rather than sounding evasive.
 */
export default function ForgotPasswordScreen() {
  const app = useApp();
  const t = useT();
  const theme = useTheme();

  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit() {
    if (!email.trim()) return;
    setSending(true);
    await app.services.auth.requestPasswordReset(email, Linking.createURL('reset-password'));
    setSending(false);
    setSent(true);
  }

  if (sent) {
    return (
      <Screen>
        <View style={{ marginTop: spacing.xl, alignItems: 'center' }}>
          <Text style={{ fontSize: 40 }}>✉️</Text>
          <Text
            style={{
              fontSize: 24,
              fontWeight: '800',
              color: theme.text,
              marginTop: spacing.md,
              textAlign: 'center',
            }}
          >
            {t('auth.forgotPassword.checkEmailTitle')}
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
            {t('auth.forgotPassword.checkEmailBody', { email: email.trim() })}
          </Text>
          <Text
            style={{
              fontSize: 14,
              color: theme.textMuted,
              marginTop: spacing.lg,
              textAlign: 'center',
              lineHeight: 20,
            }}
          >
            {t('auth.forgotPassword.notArrived')}{' '}
            <Text style={{ color: theme.primaryText, fontWeight: '700' }} onPress={() => setSent(false)}>
              {t('auth.forgotPassword.tryAnother')}
            </Text>
            .
          </Text>
          <Link href="/(auth)/sign-in" style={{ marginTop: spacing.xl }}>
            <Text style={{ color: theme.primaryText, fontWeight: '700', fontSize: 16 }}>{t('auth.forgotPassword.backToSignIn')}</Text>
          </Link>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={{ marginBottom: spacing.xl, marginTop: spacing.xl }}>
        <Text style={{ fontSize: 26, fontWeight: '800', color: theme.text }}>{t('auth.forgotPassword.mobileTitle')}</Text>
        <Text style={{ fontSize: 15, color: theme.textMuted, marginTop: 4 }}>
          {t('auth.forgotPassword.mobileSubtitle')}
        </Text>
      </View>

      <Field
        label={t('common.email')}
        placeholder={t('auth.emailPlaceholder')}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />

      <Button
        title={t('auth.forgotPassword.submit')}
        onPress={onSubmit}
        loading={sending}
        disabled={!email.trim()}
        style={{ marginTop: spacing.sm }}
      />

      <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: spacing.xl }}>
        <Text style={{ color: theme.textMuted }}>{t('auth.forgotPassword.remembered')} </Text>
        <Link href="/(auth)/sign-in">
          <Text style={{ color: theme.primaryText, fontWeight: '700' }}>{t('auth.signIn.submit')}</Text>
        </Link>
      </View>
    </Screen>
  );
}
