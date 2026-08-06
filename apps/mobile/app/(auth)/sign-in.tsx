import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Link, router } from 'expo-router';
import { DEMO_CREDENTIALS } from '@autocards/core';
import { useApp } from '../../src/lib/appContext';
import { useTheme, spacing } from '../../src/lib/theme';
import { Button, Field, Screen } from '../../src/components';

export default function SignInScreen() {
  const app = useApp();
  const theme = useTheme();
  const signIn = app.authStore((s) => s.signIn);
  const status = app.authStore((s) => s.status);
  const error = app.authStore((s) => s.error);
  const errorField = app.authStore((s) => s.errorField);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  async function onSubmit() {
    const ok = await signIn({ email, password });
    if (ok) router.replace('/(app)');
  }

  return (
    <Screen>
      <View style={{ marginBottom: spacing.xl, marginTop: spacing.xl }}>
        <Text style={{ fontSize: 32 }}>🧠</Text>
        <Text style={{ fontSize: 26, fontWeight: '800', color: theme.text, marginTop: spacing.md }}>Welcome back</Text>
        <Text style={{ fontSize: 15, color: theme.textMuted, marginTop: 4 }}>
          Sign in to keep studying where you left off.
        </Text>
      </View>

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
        placeholder="••••••••"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        error={errorField === 'password' ? error ?? undefined : undefined}
      />
      {error && !errorField && <Text style={{ color: theme.danger, marginBottom: spacing.md }}>{error}</Text>}

      <Button title="Sign in" onPress={onSubmit} loading={status === 'loading'} style={{ marginTop: spacing.sm }} />

      <Pressable
        onPress={() => {
          setEmail(DEMO_CREDENTIALS.email);
          setPassword(DEMO_CREDENTIALS.password);
        }}
        style={{
          marginTop: spacing.md,
          borderWidth: 1,
          borderStyle: 'dashed',
          borderColor: theme.border,
          borderRadius: 12,
          paddingVertical: 12,
          alignItems: 'center',
        }}
      >
        <Text style={{ color: theme.textMuted, fontWeight: '600', fontSize: 13 }}>Fill demo credentials</Text>
      </Pressable>

      <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: spacing.xl }}>
        <Text style={{ color: theme.textMuted }}>Don&apos;t have an account? </Text>
        <Link href="/(auth)/sign-up">
          <Text style={{ color: theme.primary, fontWeight: '700' }}>Sign up</Text>
        </Link>
      </View>
    </Screen>
  );
}
