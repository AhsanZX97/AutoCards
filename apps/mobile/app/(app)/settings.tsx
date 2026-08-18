import { useEffect, useMemo, useState } from 'react';
import { Alert, AppState, Linking, Text, View } from 'react-native';
import { router } from 'expo-router';
import {
  computeOverallStats,
  LOCALE_LABELS,
  SUPPORTED_LOCALES,
  type AccountSubscription,
  type LanguagePreference,
  type Translator,
} from '@autocards/core';
import { useApp, getSupabaseClient } from '../../src/lib/appContext';
import { useLocale, useT } from '../../src/lib/i18n';
import { useTheme, radius, spacing } from '../../src/lib/theme';
import { toast } from '../../src/lib/toastStore';
import { useUploadQuota, formatQuota } from '../../src/lib/useUploadQuota';
import { Badge, Button, Card, Field, GradientPanel, IconTile, Modal, ProgressBar, Screen, SwitchRow } from '../../src/components';
import { FeedbackModal } from '../../src/features/feedback/FeedbackModal';

const THEME_OPTIONS = ['light', 'dark', 'system'] as const;

/** Mirrors `describeSubscription` in core, translated — see `SettingsPage.tsx` on web for why this isn't shared as-is. */
function describeSubscriptionT(t: Translator, locale: string, subscription: AccountSubscription): string {
  if (subscription.plan === 'lifetime') {
    return t('settings.billing.boughtOutright');
  }

  const ends = subscription.currentPeriodEnd
    ? new Date(subscription.currentPeriodEnd).toLocaleDateString(locale, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : undefined;

  if (subscription.status === 'past_due') {
    return ends
      ? t('settings.billing.pastDueUntil', { plan: subscription.plan, date: ends })
      : t('settings.billing.pastDue');
  }
  if (subscription.cancelAtPeriodEnd) {
    return ends
      ? t('settings.billing.cancelledUntil', { plan: subscription.plan, date: ends })
      : t('settings.billing.cancelledPeriodEnd', { plan: subscription.plan });
  }
  if (subscription.status === 'active' || subscription.status === 'trialing') {
    return ends ? t('settings.billing.renewsOn', { date: ends }) : t('settings.billing.active');
  }
  if (subscription.status === 'canceled') return t('settings.billing.ended');
  return t('settings.billing.statusOther', { status: subscription.status });
}

/**
 * Where someone with no subscription to manage goes to see plans and upgrade —
 * Apple requires IAP for any purchase made inside the app, so this is web's own
 * billing tab, opened in the browser rather than checkout run in-app.
 */
const WEB_BILLING_URL = 'https://autocards.study/app/settings?tab=billing';

export default function SettingsScreen() {
  const app = useApp();
  const t = useT();
  const locale = useLocale();
  const theme = useTheme();
  const user = app.authStore((s) => s.session?.user);
  const signOut = app.authStore((s) => s.signOut);
  const themePref = app.settingsStore((s) => s.theme);
  const setTheme = app.settingsStore((s) => s.setTheme);
  const languagePref = app.settingsStore((s) => s.language);
  const setLanguage = app.settingsStore((s) => s.setLanguage);
  const defaults = app.settingsStore((s) => s.generationDefaults);
  const updateDefaults = app.settingsStore((s) => s.updateGenerationDefaults);
  const quota = useUploadQuota();
  const history = app.studyStore((s) => s.history);
  const stats = useMemo(() => computeOverallStats(history), [history]);
  const [subscription, setSubscription] = useState<AccountSubscription | null>(null);
  const [subscriptionLoaded, setSubscriptionLoaded] = useState(false);
  const [openingPortal, setOpeningPortal] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [unsyncedWarning, setUnsyncedWarning] = useState(false);

  const userId = user?.id;
  useEffect(() => {
    const account = app.services.account;
    if (!userId || !account) {
      setSubscriptionLoaded(true);
      return;
    }
    let live = true;

    function refetch() {
      void account!.fetchSubscription(userId!).then((found) => {
        if (live) setSubscription(found);
      });
    }

    setSubscriptionLoaded(false);
    void account.fetchSubscription(userId).then((found) => {
      if (!live) return;
      setSubscription(found);
      setSubscriptionLoaded(true);
    });

    // The Stripe portal opens in the system browser (see `handleManagePlan`),
    // so cancelling a plan there doesn't remount this screen — only
    // foregrounding the app again does, which is what this catches.
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refetch();
    });

    return () => {
      live = false;
      sub.remove();
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
        toast({
          variant: 'error',
          title: t('mobileSettings.couldNotOpenBrowser'),
          description: t('mobileSettings.visitToSeePlans', { url: WEB_BILLING_URL }),
        });
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
        title: t('mobileSettings.couldNotOpenBilling'),
        description: error instanceof Error ? error.message : t('mobileSettings.tryAgainMoment'),
      });
    } finally {
      setOpeningPortal(false);
    }
  }

  /**
   * Signing out clears this device's decks and history, so anything that has
   * not reached the server is gone with it. `signOut` pushes first and
   * returns false when it could not — being offline, usually — and that is a
   * decision for the person holding the unsaved work, not for us. Mirrors
   * web's `AppLayout.handleSignOut`.
   */
  async function handleSignOut() {
    setSigningOut(true);
    const done = await signOut();
    setSigningOut(false);
    if (done) {
      router.replace('/(auth)/welcome');
      return;
    }
    setUnsyncedWarning(true);
  }

  async function signOutAnyway() {
    setSigningOut(true);
    await signOut({ force: true });
    setSigningOut(false);
    setUnsyncedWarning(false);
    router.replace('/(auth)/welcome');
  }

  async function handleDeleteAccount() {
    if (!user) return;
    const client = getSupabaseClient();
    if (!client) return;

    Alert.alert(
      t('mobileSettings.deleteAccountTitle'),
      t('mobileSettings.deleteAccountConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await client.functions.invoke('delete-account', {
                body: { user_id: user.id },
              });
              if (error) throw error;
              // The account is already gone server-side by this point, so
              // there is nothing left to flush unsynced changes to — forcing
              // skips a flush that could only ever fail.
              await signOut({ force: true });
              router.replace('/(auth)/welcome');
            } catch (err) {
              toast({
                variant: 'error',
                title: t('settings.profile.deleteFailedTitle'),
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
      <Text style={{ fontSize: 24, fontWeight: '800', color: theme.text, marginBottom: spacing.lg }}>{t('mobileSettings.title')}</Text>

      <GradientPanel style={{ marginBottom: spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: radius.lg,
              backgroundColor: 'rgba(255,255,255,0.25)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontSize: 24 }}>👤</Text>
          </View>
          <View>
            <Text style={{ color: '#ffffff', fontWeight: '800', fontSize: 16 }}>{user.username}</Text>
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 2 }}>
              {t('mobileSettings.levelStreak', { level: stats.level.level, streak: stats.streak.current })}
            </Text>
          </View>
        </View>
      </GradientPanel>

      <Card style={{ marginBottom: spacing.md }}>
        <Text style={{ fontWeight: '700', color: theme.text, marginBottom: spacing.md }}>{t('mobileSettings.profile')}</Text>
        <Field label={t('common.username')} value={user.username} editable={false} />
        <Field label={t('common.email')} value={user.email} editable={false} />
      </Card>

      <Card style={{ marginBottom: spacing.md }}>
        <Text style={{ fontWeight: '700', color: theme.text, marginBottom: spacing.md }}>{t('settings.appearance.theme')}</Text>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          {THEME_OPTIONS.map((option) => (
            <Button
              key={option}
              title={t(`settings.appearance.theme.${option}` as const)}
              variant={themePref === option ? 'primary' : 'outline'}
              size="sm"
              onPress={() => setTheme(option)}
              style={{ flex: 1 }}
            />
          ))}
        </View>
      </Card>

      <Card style={{ marginBottom: spacing.md }}>
        <Text style={{ fontWeight: '700', color: theme.text, marginBottom: spacing.md }}>{t('settings.appearance.language')}</Text>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          {(['system', ...SUPPORTED_LOCALES] as LanguagePreference[]).map((option) => (
            <Button
              key={option}
              title={option === 'system' ? t('settings.appearance.language.system') : LOCALE_LABELS[option]}
              variant={languagePref === option ? 'primary' : 'outline'}
              size="sm"
              onPress={() => setLanguage(option)}
              style={{ flex: 1 }}
            />
          ))}
        </View>
      </Card>

      <Card style={{ marginBottom: spacing.md }}>
        <Text style={{ fontWeight: '700', color: theme.text, marginBottom: spacing.md }}>{t('mobileSettings.generationDefaults')}</Text>
        <SwitchRow
          label={t('createDeck.autoCategorize')}
          value={defaults.autoCategories}
          onValueChange={(v) => updateDefaults({ autoCategories: v })}
        />
        <SwitchRow
          label={t('createDeck.includeHints')}
          value={defaults.includeHints}
          onValueChange={(v) => updateDefaults({ includeHints: v })}
        />
        <SwitchRow
          label={t('createDeck.includeExplanations')}
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
            {t('mobileSettings.planSuffix', { plan: user.plan })}
          </Text>
          <View style={{ flexDirection: 'row', gap: spacing.xs }}>
            {subscription?.status === 'past_due' && (
              <Badge label={t('settings.billing.paymentFailed')} color={theme.warning} softColor={theme.warningSoft} />
            )}
            {subscription?.cancelAtPeriodEnd && (
              <Badge label={t('settings.billing.cancelling')} color={theme.primaryText} softColor={theme.primarySoft} />
            )}
          </View>
        </View>
        {subscription && (
          <Text style={{ color: theme.textMuted, fontSize: 13, marginBottom: spacing.md }}>
            {describeSubscriptionT(t, locale, subscription)}
          </Text>
        )}

        <Text style={{ fontWeight: '600', color: theme.text, fontSize: 13, marginBottom: spacing.xs }}>
          {t('mobileSettings.uploadAllowance')}
        </Text>
        {quota.limit !== Number.POSITIVE_INFINITY && (
          <View style={{ marginBottom: spacing.xs }}>
            <ProgressBar value={quota.used} max={quota.limit} />
          </View>
        )}
        <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: spacing.md }}>
          {formatQuota(t, quota)}
        </Text>

        <Button
          title={
            !subscriptionLoaded
              ? t('common.loading')
              : subscription
                ? ownsOutright
                  ? t('settings.billing.receipts')
                  : t('settings.billing.manageBilling')
                : t('mobileSettings.seePlansOnWeb')
          }
          variant="outline"
          size="sm"
          disabled={!subscriptionLoaded}
          loading={openingPortal}
          onPress={handleManagePlan}
        />
      </Card>

      <Button
        title={t('mobileSettings.sendFeedback')}
        variant="outline"
        onPress={() => setFeedbackOpen(true)}
        style={{ marginBottom: spacing.md }}
      />

      <Button
        title={t('mobileSettings.deleteAccount')}
        variant="danger"
        onPress={handleDeleteAccount}
        style={{ marginBottom: spacing.sm }}
      />

      <Button title={t('mobileSettings.signOut')} variant="danger" onPress={handleSignOut} loading={signingOut} />

      <FeedbackModal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />

      <Modal
        open={unsyncedWarning}
        onClose={() => setUnsyncedWarning(false)}
        title={t('nav.unsyncedTitle')}
        description={t('nav.unsyncedBody')}
        footer={
          <>
            <Button
              title={t('nav.staySignedIn')}
              variant="ghost"
              onPress={() => setUnsyncedWarning(false)}
              style={{ flex: 1 }}
            />
            <Button
              title={t('nav.signOutAndLose')}
              variant="danger"
              onPress={() => void signOutAnyway()}
              disabled={signingOut}
              style={{ flex: 1 }}
            />
          </>
        }
      >
        <Text style={{ color: theme.textMuted, fontSize: 13 }}>{t('nav.unsyncedBodyDetail')}</Text>
      </Modal>
    </Screen>
  );
}
