import { useEffect, useState } from 'react';
import { Alert, Linking, Text, View } from 'react-native';
import { router } from 'expo-router';
import { describeSubscription, type AccountSubscription } from '@autocards/core';
import { useApp, getSupabaseClient } from '../../src/lib/appContext';
import { useTheme, spacing } from '../../src/lib/theme';
import { toast } from '../../src/lib/toastStore';
import { useUploadQuota, formatQuota } from '../../src/lib/useUploadQuota';
import { Badge, Button, Card, Field, ProgressBar, Screen, SwitchRow } from '../../src/components';
import { FeedbackModal } from '../../src/features/feedback/FeedbackModal';

const THEME_OPTIONS = ['light', 'dark', 'system'] as const;

/**
 * Where someone with no subscription to manage goes to see plans and upgrade —
 * Apple requires IAP for any purchase made inside the app, so this is web's own
 * billing tab, opened in the browser rather than checkout run in-app.
 */
const WEB_BILLING_URL = 'https://autocards.study/app/settings?tab=billing';

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
  const [subscriptionLoaded, setSubscriptionLoaded] = useState(false);
  const [openingPortal, setOpeningPortal] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  const userId = user?.id;
  useEffect(() => {
    const account = app.services.account;
    if (!userId || !account) {
      setSubscriptionLoaded(true);
      return;
    }
    let live = true;
    setSubscriptionLoaded(false);
    void account.fetchSubscription(userId).then((found) => {
      if (!live) return;
      setSubscription(found);
      setSubscriptionLoaded(true);
    });
    return () => {
      live = false;
    };
  }, [app, userId]);

  const ownsOutright = subscription?.plan === 'lifetime';

  /**
   * Same call the web app's own "Manage billing" button makes — the Stripe
   * Customer Portal, opened in the browser rather than a static settings URL.
   * A free account has no subscription for the portal to open, so that case
   * falls back to the web app's billing tab instead, same as `PlanLimitNotice`.
   */
  async function handleManagePlan() {
    if (!subscriptionLoaded) return;
    const billing = app.services.billing;
    if (!subscription || !billing) {
      try {
        await Linking.openURL(WEB_BILLING_URL);
      } catch {
        toast({ variant: 'error', title: 'Could not open browser', description: `Visit ${WEB_BILLING_URL} to see plans.` });
      }
      return;
    }

    setOpeningPortal(true);
    try {
      const url = await billing.openPortal();
      await Linking.openURL(url);
    } catch (error) {
      toast({
        variant: 'error',
        title: 'Could not open billing',
        description: error instanceof Error ? error.message : 'Try again in a moment.',
      });
    } finally {
      setOpeningPortal(false);
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
              toast({
                variant: 'error',
                title: 'Could not delete account',
                description: err instanceof Error ? err.message : undefined,
              });
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

        <Button
          title={
            !subscriptionLoaded
              ? 'Loading…'
              : subscription
                ? ownsOutright
                  ? 'Receipts'
                  : 'Manage billing'
                : 'See plans on the web'
          }
          variant="outline"
          size="sm"
          disabled={!subscriptionLoaded}
          loading={openingPortal}
          onPress={handleManagePlan}
        />
      </Card>

      <Card style={{ marginBottom: spacing.md }}>
        <Text style={{ color: theme.textMuted, fontSize: 12 }}>
          Reading text out of a PDF is not available on mobile yet, so creating decks from your own
          files is web-only for now.
        </Text>
      </Card>

      <Button
        title="Send feedback"
        variant="outline"
        onPress={() => setFeedbackOpen(true)}
        style={{ marginBottom: spacing.md }}
      />

      <Button
        title="Delete account"
        variant="danger"
        onPress={handleDeleteAccount}
        style={{ marginBottom: spacing.sm }}
      />

      <Button title="Sign out" variant="danger" onPress={handleSignOut} />

      <FeedbackModal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
    </Screen>
  );
}
