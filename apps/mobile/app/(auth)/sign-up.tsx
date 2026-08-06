import { useState } from 'react';
import { Text, View } from 'react-native';
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

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  async function onSubmit() {
    const ok = await signUp({ name, email, password });
    if (ok) router.replace('/(app)');
  }

  return (
    <Screen>
      <View style={{ marginBottom: spacing.xl, marginTop: spacing.xl }}>
        <Text style={{ fontSize: 32 }}>🧠</Text>
        <Text style={{ fontSize: 26, fontWeight: '800', color: theme.text, marginTop: spacing.md }}>
          Create your account
        </Text>
        <Text style={{ fontSize: 15, color: theme.textMuted, marginTop: 4 }}>
          Free to start. No credit card required.
        </Text>
      </View>

      <Field
        label="Full name"
        placeholder="Alex Rivera"
        value={name}
        onChangeText={setName}
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
          <Text style={{ color: theme.primary, fontWeight: '700' }}>Sign in</Text>
        </Link>
      </View>
      <Text style={{ textAlign: 'center', color: theme.textFaint, fontSize: 12, marginTop: spacing.lg }}>
        Auth is mocked for this preview — any valid-looking email works.
      </Text>
    </Screen>
  );
}
