import { useState } from 'react';
import { Image, Text, View } from 'react-native';
import { Link, router } from 'expo-router';
import { useApp } from '../../src/lib/appContext';
import { useTheme, spacing } from '../../src/lib/theme';
import { Button, Field, Screen } from '../../src/components';

export default function SignUpScreen() {
  const app = useApp();
  const theme = useTheme();
  const signUp = app.authStore((s) => s.signUp);
  const status = app.authStore((s) => s.status);
  const error = app.authStore((s) => s.error);
  const errorField = app.authStore((s) => s.errorField);
  const pendingEmail = app.authStore((s) => s.pendingConfirmationEmail);

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  async function onSubmit() {
    const ok = await signUp({ username, email, password });
    if (ok) router.replace('/(app)');
  }

  if (pendingEmail) {
    return (
      <Screen>
        <View style={{ marginTop: spacing.xl, alignItems: 'center' }}>
          <Text style={{ fontSize: 40 }}>✉️</Text>
          <Text style={{ fontSize: 24, fontWeight: '800', color: theme.text, marginTop: spacing.md, textAlign: 'center' }}>
            Check your email
          </Text>
          <Text style={{ fontSize: 15, color: theme.textMuted, marginTop: spacing.md, textAlign: 'center', lineHeight: 22 }}>
            We sent a confirmation link to{' '}
            <Text style={{ fontWeight: '700', color: theme.text }}>{pendingEmail}</Text>.
            Click it to confirm your account, then sign in.
          </Text>
          <Link href="/(auth)/sign-in" style={{ marginTop: spacing.xl }}>
            <Text style={{ color: theme.primaryText, fontWeight: '700', fontSize: 16 }}>Go to sign in</Text>
          </Link>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={{ marginBottom: spacing.xl, marginTop: spacing.xl }}>
        <Image source={require('../../assets/icon.png')} style={{ width: 40, height: 40, borderRadius: 10 }} />
        <Text style={{ fontSize: 26, fontWeight: '800', color: theme.text, marginTop: spacing.md }}>
          Create your account
        </Text>
        <Text style={{ fontSize: 15, color: theme.textMuted, marginTop: 4 }}>
          Free to start. No credit card required.
        </Text>
      </View>

      <Field
        label="Username"
        hint="3–20 chars, lowercase, a–z, 0–9, _"
        placeholder="alex_rivera"
        autoCapitalize="none"
        autoCorrect={false}
        value={username}
        onChangeText={setUsername}
        error={errorField === 'name' ? error ?? undefined : undefined}
      />
      <Field
        label="Email"
        placeholder="you@example.com"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        error={errorField === 'email' ? error ?? undefined : undefined}
      />
      <Field
        label="Password"
        hint="8+ characters"
        placeholder="••••••••"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        error={errorField === 'password' ? error ?? undefined : undefined}
      />
      {error && !errorField && <Text style={{ color: theme.danger, marginBottom: spacing.md }}>{error}</Text>}

      <Button title="Create account" onPress={onSubmit} loading={status === 'loading'} style={{ marginTop: spacing.sm }} />

      <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: spacing.xl }}>
        <Text style={{ color: theme.textMuted }}>Already have an account? </Text>
        <Link href="/(auth)/sign-in">
          <Text style={{ color: theme.primaryText, fontWeight: '700' }}>Sign in</Text>
        </Link>
      </View>
    </Screen>
  );
}
