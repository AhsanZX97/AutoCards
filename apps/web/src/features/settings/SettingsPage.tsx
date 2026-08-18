import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  LOCALE_LABELS,
  PLAN_LIMITS,
  PLANS,
  SUPPORTED_LOCALES,
  isAdmin,
  type AccountSubscription,
  type App,
  type LanguagePreference,
  type Plan,
  type PurchasablePlan,
  type Translator,
} from '@autocards/core';
import { FunctionsFetchError } from '@supabase/supabase-js';
import { useApp, getSupabaseClient } from '../../lib/appContext';
import { useLocale, useT } from '../../lib/i18n';
import { Avatar, Badge, Button, Card, CardBody, Field, Input, Modal, Progress, Select, Switch, Tabs } from '../../components/ui';
import { toast } from '../../components/ui/toastStore';
import { useUploadQuota } from '../../lib/useUploadQuota';

export function SettingsPage() {
  const t = useT();
  const [params] = useSearchParams();
  const TABS = [
    { id: 'profile', label: t('settings.tab.profile'), icon: '👤' },
    { id: 'appearance', label: t('settings.tab.appearance'), icon: '🎨' },
    { id: 'generation', label: t('settings.tab.generation'), icon: '🧠' },
    { id: 'billing', label: t('settings.tab.billing'), icon: '💳' },
  ];
  const [tab, setTab] = useState(() => {
    if (params.get('checkout')) return 'billing';
    const requested = params.get('tab');
    return TABS.some((entry) => entry.id === requested) ? (requested as string) : 'profile';
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">{t('settings.title')}</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t('settings.subtitle')}</p>
      </div>

      <Tabs items={TABS} active={tab} onChange={setTab} />

      {tab === 'profile' && <ProfileTab />}
      {tab === 'appearance' && <AppearanceTab />}
      {tab === 'generation' && <GenerationTab />}
      {tab === 'billing' && <BillingTab />}
    </div>
  );
}

function ProfileTab() {
  const app = useApp();
  const t = useT();
  const user = app.authStore((s) => s.session?.user);
  const signOut = app.authStore((s) => s.signOut);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function deleteAccount() {
    if (!user) return;
    const client = getSupabaseClient();
    if (!client) return;
    setDeleting(true);
    try {
      const { error } = await client.functions.invoke('delete-account', {
        body: { user_id: user.id },
      });
      if (error) throw error;
      await signOut({ force: true });
      window.location.href = '/';
    } catch (err) {
      if (err instanceof FunctionsFetchError) {
        // The browser failed to read the response rather than the request
        // failing to send — seen in practice with browser tracking
        // prevention blocking `/functions/` URLs. The delete call still
        // reaches the server either way, so treat this as a done deal rather
        // than leaving the account looking alive when it may already be gone.
        await signOut({ force: true });
        window.location.href = '/';
        return;
      }
      setDeleting(false);
      setConfirmOpen(false);
      toast({
        variant: 'error',
        title: t('settings.profile.deleteFailedTitle'),
        description: err instanceof Error ? err.message : undefined,
      });
    }
  }

  if (!user) return null;

  return (
    <Card>
      <CardBody className="space-y-5">
        <div className="flex items-center gap-4">
          <Avatar name={user.username} initials={user.initials} avatarUrl={user.avatarUrl} size="lg" />
          <div>
            <p className="font-semibold text-slate-900 dark:text-white">@{user.username}</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">{user.email}</p>
          </div>
        </div>
        <Field label={t('common.username')}>
          <Input value={user.username} disabled />
        </Field>
        <Field label={t('common.email')}>
          <Input value={user.email} disabled />
        </Field>
        <div className="pt-2">
          <Button variant="danger" onClick={() => setConfirmOpen(true)}>
            {t('settings.profile.deleteAccount')}
          </Button>
        </div>
      </CardBody>

      <Modal
        open={confirmOpen}
        onClose={() => !deleting && setConfirmOpen(false)}
        title={t('settings.profile.deleteConfirmTitle')}
        description={t('settings.profile.deleteConfirmBody')}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)} disabled={deleting}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" onClick={() => void deleteAccount()} loading={deleting}>
              {t('settings.profile.deleteAccount')}
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600 dark:text-slate-300">{t('settings.profile.deleteWarning')}</p>
      </Modal>
    </Card>
  );
}

const THEME_ICONS = { light: '☀️', dark: '🌙', system: '💻' } as const;

function themeLabel(t: Translator, option: 'light' | 'dark' | 'system'): string {
  return t(`settings.appearance.theme.${option}` as const);
}

function AppearanceTab() {
  const app = useApp();
  const t = useT();
  const theme = app.settingsStore((s) => s.theme);
  const setTheme = app.settingsStore((s) => s.setTheme);
  const language = app.settingsStore((s) => s.language);
  const setLanguage = app.settingsStore((s) => s.setLanguage);
  const completedTours = app.tourStore((s) => s.completedTours);
  const resetTours = app.tourStore((s) => s.resetTours);

  function replayTours() {
    resetTours();
    toast({
      variant: 'success',
      title: t('settings.appearance.toursResetTitle'),
      description: t('settings.appearance.toursResetBody'),
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardBody className="space-y-4">
          <h3 className="font-semibold text-slate-900 dark:text-white">{t('settings.appearance.theme')}</h3>
          <div className="grid grid-cols-3 gap-3">
            {(['light', 'dark', 'system'] as const).map((option) => (
              <button
                key={option}
                onClick={() => setTheme(option)}
                className={`rounded-xl border p-4 text-center text-sm font-medium transition-colors ${
                  theme === option
                    ? 'border-brand-600 bg-brand-50 text-brand-700 dark:border-brand-500 dark:bg-brand-500/10 dark:text-brand-400'
                    : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-800 dark:text-slate-300'
                }`}
              >
                <span className="mb-2 block text-xl">{THEME_ICONS[option]}</span>
                {themeLabel(t, option)}
              </button>
            ))}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-4">
          <h3 className="font-semibold text-slate-900 dark:text-white">{t('settings.appearance.language')}</h3>
          <div className="grid grid-cols-3 gap-3">
            {(['system', ...SUPPORTED_LOCALES] as LanguagePreference[]).map((option) => (
              <button
                key={option}
                onClick={() => setLanguage(option)}
                className={`rounded-xl border p-4 text-center text-sm font-medium transition-colors ${
                  language === option
                    ? 'border-brand-600 bg-brand-50 text-brand-700 dark:border-brand-500 dark:bg-brand-500/10 dark:text-brand-400'
                    : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-800 dark:text-slate-300'
                }`}
              >
                {option === 'system' ? t('settings.appearance.language.system') : LOCALE_LABELS[option]}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-400">{t('settings.appearance.language.hint')}</p>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-white">{t('settings.appearance.tours')}</h3>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{t('settings.appearance.toursBody')}</p>
          </div>
          <Button variant="outline" onClick={replayTours} disabled={completedTours.length === 0}>
            {completedTours.length === 0 ? t('settings.appearance.toursNotSeen') : t('settings.appearance.toursReplay')}
          </Button>
        </CardBody>
      </Card>
    </div>
  );
}

function GenerationTab() {
  const app = useApp();
  const t = useT();
  const defaults = app.settingsStore((s) => s.generationDefaults);
  const updateDefaults = app.settingsStore((s) => s.updateGenerationDefaults);

  return (
    <div className="space-y-6">
      <Card>
        <CardBody className="space-y-4">
          <h3 className="font-semibold text-slate-900 dark:text-white">{t('settings.generation.title')}</h3>
          <Field label={t('settings.generation.cardCount')}>
            <Input
              type="number"
              min={5}
              max={100}
              value={defaults.cardCount}
              onChange={(e) => updateDefaults({ cardCount: Number(e.target.value) })}
            />
          </Field>
          <Switch
            checked={defaults.autoCategories}
            onChange={(v) => updateDefaults({ autoCategories: v })}
            label={t('settings.generation.autoCategorize')}
          />
          <Switch
            checked={defaults.includeHints}
            onChange={(v) => updateDefaults({ includeHints: v })}
            label={t('settings.generation.includeHints')}
          />
          <Switch
            checked={defaults.includeExplanations}
            onChange={(v) => updateDefaults({ includeExplanations: v })}
            label={t('settings.generation.includeExplanations')}
          />
        </CardBody>
      </Card>
    </div>
  );
}

const PURCHASABLE_PLANS: Plan[] = ['pro', 'lifetime'];
const ONE_TIME_PLANS: Plan[] = ['lifetime'];

function planPrice(t: Translator, plan: Plan): string {
  if (plan === 'free') return t('settings.billing.priceFree');
  if (plan === 'lifetime') return t('settings.billing.priceLifetimeOnce', { price: '$39' });
  return t('settings.billing.priceProMonthly', { price: '$4' });
}

function describeSubscription(t: Translator, locale: string, subscription: AccountSubscription): string {
  if (ONE_TIME_PLANS.includes(subscription.plan)) {
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

async function waitForUpgrade(app: App, purchased: Plan): Promise<Plan | null> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await app.authStore.getState().restore();
    const plan = app.authStore.getState().session?.user.plan;
    if (plan === purchased) return plan;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  return null;
}

function BillingTab() {
  const app = useApp();
  const t = useT();
  const locale = useLocale();
  const user = app.authStore((s) => s.session?.user);
  const changePlan = app.authStore((s) => s.changePlan);
  const quota = useUploadQuota();
  const billing = app.services.billing;

  const [params, setParams] = useSearchParams();
  const [starting, setStarting] = useState<Plan | null>(null);
  const [activating, setActivating] = useState(false);
  const [subscription, setSubscription] = useState<AccountSubscription | null>(null);
  const [openingPortal, setOpeningPortal] = useState(false);

  const userId = user?.id;
  useEffect(() => {
    const account = app.services.account;
    if (!userId || !account || activating) return;
    let live = true;
    void account.fetchSubscription(userId).then((found) => {
      if (live) setSubscription(found);
    });
    return () => {
      live = false;
    };
  }, [app, userId, activating]);

  useEffect(() => {
    const outcome = params.get('checkout');
    if (!outcome) return;

    const purchasedParam = params.get('plan');
    const purchased: Plan = PURCHASABLE_PLANS.includes(purchasedParam as Plan)
      ? (purchasedParam as Plan)
      : 'pro';

    const next = new URLSearchParams(params);
    next.delete('checkout');
    next.delete('plan');
    setParams(next, { replace: true });

    if (outcome === 'cancelled') {
      toast({
        variant: 'info',
        title: t('settings.billing.checkoutCancelledTitle'),
        description: t('settings.billing.checkoutCancelledBody'),
      });
      return;
    }
    if (outcome !== 'success') return;

    setActivating(true);
    void waitForUpgrade(app, purchased)
      .then((upgraded) => {
        toast(
          upgraded
            ? {
                variant: 'success',
                title:
                  upgraded === 'lifetime'
                    ? t('settings.billing.lifetimeOwnedTitle')
                    : t('settings.billing.proOwnedTitle'),
                description:
                  upgraded === 'lifetime'
                    ? t('settings.billing.lifetimeOwnedBody')
                    : t('settings.billing.upgradeOwnedBody'),
              }
            : {
                variant: 'info',
                title: t('settings.billing.paymentReceivedTitle'),
                description: t('settings.billing.paymentReceivedBody'),
              },
        );
      })
      .finally(() => setActivating(false));
  }, [app, params, setParams, t]);

  if (!user) return null;

  const canSwitchPlans = isAdmin(user);
  const ownsOutright = ONE_TIME_PLANS.includes(user.plan);

  async function upgrade(plan: Plan) {
    if (!billing) return;
    setStarting(plan);
    try {
      window.location.href = await billing.startCheckout(plan as PurchasablePlan);
    } catch (error) {
      toast({
        variant: 'error',
        title: error instanceof Error ? error.message : t('settings.billing.checkoutFailed'),
      });
      setStarting(null);
    }
  }

  async function comp(plan: Plan) {
    try {
      await changePlan(plan);
      toast({ variant: 'success', title: t('settings.billing.switchedTo', { plan }) });
    } catch (error) {
      toast({
        variant: 'error',
        title: error instanceof Error ? error.message : t('settings.billing.switchPlanFailed'),
      });
    }
  }

  async function manageBilling() {
    if (!billing) return;
    setOpeningPortal(true);
    try {
      window.location.href = await billing.openPortal();
    } catch (error) {
      toast({
        variant: 'error',
        title: error instanceof Error ? error.message : t('settings.billing.portalFailed'),
      });
      setOpeningPortal(false);
    }
  }

  return (
    <div className="space-y-4">
      {activating && (
        <Card>
          <CardBody className="text-sm text-slate-500 dark:text-slate-400">
            {t('settings.billing.activating')}
          </CardBody>
        </Card>
      )}

      {subscription && (
        <Card>
          <CardBody className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-slate-900 dark:text-white">
                  {ownsOutright ? t('settings.billing.yourPlan') : t('settings.billing.yourSubscription')}
                </h3>
                {subscription.status === 'past_due' && <Badge variant="warning">{t('settings.billing.paymentFailed')}</Badge>}
                {subscription.cancelAtPeriodEnd && <Badge variant="info">{t('settings.billing.cancelling')}</Badge>}
              </div>
              <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                {describeSubscription(t, locale, subscription)}
              </p>
            </div>
            <Button variant="outline" onClick={() => void manageBilling()} disabled={openingPortal}>
              {openingPortal
                ? t('settings.billing.opening')
                : ownsOutright
                  ? t('settings.billing.receipts')
                  : t('settings.billing.manageBilling')}
            </Button>
          </CardBody>
        </Card>
      )}
      <Card>
        <CardBody className="space-y-2">
          <div className="flex items-baseline justify-between">
            <h3 className="font-semibold text-slate-900 dark:text-white">{t('settings.billing.uploadsThisMonth')}</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {quota.used} / {formatLimit(t, quota.limit)}
            </p>
          </div>
          {quota.limit !== Number.POSITIVE_INFINITY && (
            <Progress value={quota.used} max={quota.limit} />
          )}
          <p className="text-xs text-slate-400">{t('settings.billing.uploadsHint')}</p>
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {PLANS.map((plan) => {
          const limits = PLAN_LIMITS[plan];
          const isCurrent = user.plan === plan;
          const forSale = billing && PURCHASABLE_PLANS.includes(plan) && !ownsOutright;
          return (
            <Card key={plan} className={isCurrent ? 'border-2 border-brand-600 dark:border-brand-500' : undefined}>
              <CardBody>
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold capitalize text-slate-900 dark:text-white">{plan}</h3>
                  {isCurrent && <Badge variant="info">{t('settings.billing.current')}</Badge>}
                </div>
                <p className="mt-0.5 text-xs font-medium text-slate-600 dark:text-slate-300">{planPrice(t, plan)}</p>
                <ul className="mt-3 space-y-1.5 text-xs text-slate-500 dark:text-slate-400">
                  <li>{t('settings.billing.uploadsPerMonth', { count: formatLimit(t, limits.monthlyUploads) })}</li>
                  <li>{t('settings.billing.decksCount', { count: formatLimit(t, limits.maxDecks) })}</li>
                  <li>{t('settings.billing.pagesPerDoc', { count: formatLimit(t, limits.maxPagesPerPdf) })}</li>
                </ul>
                {!isCurrent && forSale && (
                  <Button
                    size="sm"
                    className="mt-4 w-full"
                    disabled={starting !== null}
                    onClick={() => void upgrade(plan)}
                  >
                    {starting === plan
                      ? t('settings.billing.openingCheckout')
                      : ONE_TIME_PLANS.includes(plan)
                        ? t('settings.billing.buyLifetime')
                        : t('settings.billing.upgradeTo', { plan })}
                  </Button>
                )}
                {!isCurrent && canSwitchPlans && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2 w-full"
                    onClick={() => void comp(plan)}
                  >
                    {t('settings.billing.switchTo', { plan })}
                  </Button>
                )}
              </CardBody>
            </Card>
          );
        })}
      </div>

      {!billing && (
        <p className="text-xs text-slate-400">{t('settings.billing.checkoutOff')}</p>
      )}
    </div>
  );
}

function formatLimit(t: Translator, value: number): string {
  return value === Number.POSITIVE_INFINITY ? t('settings.billing.unlimited') : String(value);
}
