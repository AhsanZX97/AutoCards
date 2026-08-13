import { useState } from 'react';
import { Text, View } from 'react-native';
import { Link } from 'expo-router';
import * as Linking from 'expo-linking';
import { useApp } from '../../src/lib/appContext';
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
            Check your email
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
            If there&apos;s an account for{' '}
            <Text style={{ fontWeight: '700', color: theme.text }}>{email.trim()}</Text>, a link to
            set a new password is on its way. It expires in an hour.
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
            Didn&apos;t arrive? Check your spam folder, or{' '}
            <Text style={{ color: theme.primaryText, fontWeight: '700' }} onPress={() => setSent(false)}>
              try another address
            </Text>
            .
          </Text>
          <Link href="/(auth)/sign-in" style={{ marginTop: spacing.xl }}>
            <Text style={{ color: theme.primaryText, fontWeight: '700', fontSize: 16 }}>Back to sign in</Text>
          </Link>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={{ marginBottom: spacing.xl, marginTop: spacing.xl }}>
        <Text style={{ fontSize: 26, fontWeight: '800', color: theme.text }}>Forgot your password?</Text>
        <Text style={{ fontSize: 15, color: theme.textMuted, marginTop: 4 }}>
          Enter your email and we&apos;ll send you a link to set a new one.
        </Text>
      </View>

      <Field
        label="Email"
        placeholder="you@example.com"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />

      <Button
        title="Send reset link"
        onPress={onSubmit}
        loading={sending}
        disabled={!email.trim()}
        style={{ marginTop: spacing.sm }}
      />

      <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: spacing.xl }}>
        <Text style={{ color: theme.textMuted }}>Remembered it? </Text>
        <Link href="/(auth)/sign-in">
          <Text style={{ color: theme.primaryText, fontWeight: '700' }}>Sign in</Text>
        </Link>
      </View>
    </Screen>
  );
}
