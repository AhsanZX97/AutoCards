import { useEffect, useState } from 'react';
import { Alert, Linking, Text, View } from 'react-native';
import { router } from 'expo-router';
import { describeSubscription, type AccountSubscription } from '@autocards/core';
import { useApp, getSupabaseClient } from '../../src/lib/appContext';
import { useTheme, spacing } from '../../src/lib/theme';
import { useUploadQuota, formatQuota } from '../../src/lib/useUploadQuota';
import { Badge, Button, Card, Field, ProgressBar, Screen, SwitchRow } from '../../src/components';

const THEME_OPTIONS = ['light', 'dark', 'system'] as const;

/** Where "Manage your plan on the web" sends people — Apple requires IAP for purchases made inside the app. */
const WEB_BILLING_URL = 'https://autocards.app/app/settings?tab=billing';

export default function SettingsScreen() {
  const app = useApp();
  const theme = useTheme();
  const user = app.authStore((s) => s.session?.user);
  const signOut = app.authStore((s) => s.signOut);
  const themePref = app.settingsStore((s) => s.theme);
  const setTheme = app.settingsStore((s) => s.setTheme);
  const defaults = app.settingsStore((s) => s.generationDefaults);
  const updateDefaults = app.settingsStore((s) => s.updateGenerationDefaults);
  const quota = useUploadQuota();
  const [subscription, setSubscription] = useState<AccountSubscription | null>(null);

  const userId = user?.id;
  useEffect(() => {
    const account = app.services.account;
    if (!userId || !account) return;
    let live = true;
    void account.fetchSubscription(userId).then((found) => {
      if (live) setSubscription(found);
    });
    return () => {
      live = false;
    };
  }, [app, userId]);

  async function handleManagePlan() {
    try {
      await Linking.openURL(WEB_BILLING_URL);
    } catch {
      Alert.alert('Could not open browser', `Visit ${WEB_BILLING_URL} to manage your plan.`);
    }
  }

  async function handleSignOut() {
    await signOut();
    router.replace('/(auth)/sign-in');
  }

  async function handleDeleteAccount() {
    if (!user) return;
    const client = getSupabaseClient();
    if (!client) return;

    Alert.alert(
      'Delete Account',
      'This action is permanent and cannot be undone. All your data will be deleted. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await client.functions.invoke('delete-account', {
                body: { user_id: user.id },
              });
              if (error) throw error;
              await signOut();
              router.replace('/(auth)/sign-in');
            } catch (err) {
              Alert.alert('Error', err instanceof Error ? err.message : 'Could not delete account');
            }
          },
        },
      ],
    );
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
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: spacing.sm,
          }}
        >
          <Text style={{ fontWeight: '700', color: theme.text, textTransform: 'capitalize' }}>
            {user.plan} plan
          </Text>
          <View style={{ flexDirection: 'row', gap: spacing.xs }}>
            {subscription?.status === 'past_due' && (
              <Badge label="Payment failed" color={theme.warning} softColor={theme.warningSoft} />
            )}
            {subscription?.cancelAtPeriodEnd && (
              <Badge label="Cancelling" color={theme.primaryText} softColor={theme.primarySoft} />
            )}
          </View>
        </View>
        {subscription && (
          <Text style={{ color: theme.textMuted, fontSize: 13, marginBottom: spacing.md }}>
            {describeSubscription(subscription)}
          </Text>
        )}

        <Text style={{ fontWeight: '600', color: theme.text, fontSize: 13, marginBottom: spacing.xs }}>
          Upload allowance
        </Text>
        {quota.limit !== Number.POSITIVE_INFINITY && (
          <View style={{ marginBottom: spacing.xs }}>
            <ProgressBar value={quota.used} max={quota.limit} />
          </View>
        )}
        <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: spacing.md }}>
          {formatQuota(quota)}
        </Text>

        <Button title="Manage your plan on the web" variant="outline" size="sm" onPress={handleManagePlan} />
      </Card>

      <Card style={{ marginBottom: spacing.md }}>
        <Text style={{ color: theme.textMuted, fontSize: 12 }}>
          Reading text out of a PDF is not available on mobile yet, so creating decks from your own
          files is web-only for now.
        </Text>
      </Card>

      <Button
        title="Delete account"
        variant="danger"
        onPress={handleDeleteAccount}
        style={{ marginBottom: spacing.sm }}
      />

      <Button title="Sign out" variant="danger" onPress={handleSignOut} />
    </Screen>
  );
}
