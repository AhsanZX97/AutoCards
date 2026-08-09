import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { useApp } from '../../src/lib/appContext';
import { useTheme, spacing } from '../../src/lib/theme';
import { Button, Card, Field, Screen, SwitchRow } from '../../src/components';

const THEME_OPTIONS = ['light', 'dark', 'system'] as const;

export default function SettingsScreen() {
  const app = useApp();
  const theme = useTheme();
  const user = app.authStore((s) => s.session?.user);
  const signOut = app.authStore((s) => s.signOut);
  const themePref = app.settingsStore((s) => s.theme);
  const setTheme = app.settingsStore((s) => s.setTheme);
  const defaults = app.settingsStore((s) => s.generationDefaults);
  const updateDefaults = app.settingsStore((s) => s.updateGenerationDefaults);

  async function handleSignOut() {
    await signOut();
    router.replace('/(auth)/sign-in');
  }

  if (!user) return null;

  return (
    <Screen>
      <Text style={{ fontSize: 24, fontWeight: '800', color: theme.text, marginBottom: spacing.lg }}>Settings</Text>

      <Card style={{ marginBottom: spacing.md }}>
        <Text style={{ fontWeight: '700', color: theme.text, marginBottom: spacing.md }}>Profile</Text>
        <Field label="Username" value={user.username} editable={false} />
        <Field label="Email" value={user.email} editable={false} />
      </Card>

      <Card style={{ marginBottom: spacing.md }}>
        <Text style={{ fontWeight: '700', color: theme.text, marginBottom: spacing.md }}>Theme</Text>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          {THEME_OPTIONS.map((option) => (
            <Button
              key={option}
              title={option[0]!.toUpperCase() + option.slice(1)}
              variant={themePref === option ? 'primary' : 'outline'}
              size="sm"
              onPress={() => setTheme(option)}
              style={{ flex: 1 }}
            />
          ))}
        </View>
      </Card>

      <Card style={{ marginBottom: spacing.md }}>
        <Text style={{ fontWeight: '700', color: theme.text, marginBottom: spacing.md }}>Generation defaults</Text>
        <SwitchRow
          label="Auto-categorize"
          value={defaults.autoCategories}
          onValueChange={(v) => updateDefaults({ autoCategories: v })}
        />
        <SwitchRow
          label="Include hints"
          value={defaults.includeHints}
          onValueChange={(v) => updateDefaults({ includeHints: v })}
        />
        <SwitchRow
          label="Include explanations"
          value={defaults.includeExplanations}
          onValueChange={(v) => updateDefaults({ includeExplanations: v })}
        />
      </Card>

      <Card style={{ marginBottom: spacing.md }}>
        <Text style={{ fontWeight: '700', color: theme.text }}>Plan: {user.plan}</Text>
        <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 4 }}>
          Reading text out of a PDF is not available on mobile yet, so creating decks from your own
          files is web-only for now.
        </Text>
      </Card>

      <Button title="Sign out" variant="danger" onPress={handleSignOut} />
    </Screen>
  );
}
