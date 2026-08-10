import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  PLAN_LIMITS,
  PLANS,
  isAdmin,
  type AccountSubscription,
  type App,
  type Plan,
  type PurchasablePlan,
} from '@autocards/core';
import { useApp } from '../../lib/appContext';
import { Avatar, Badge, Button, Card, CardBody, Field, Input, Progress, Select, Switch, Tabs } from '../../components/ui';
import { toast } from '../../components/ui/toastStore';
import { useUploadQuota } from '../../lib/useUploadQuota';

const TABS = [
  { id: 'profile', label: 'Profile', icon: '👤' },
  { id: 'appearance', label: 'Appearance', icon: '🎨' },
  { id: 'generation', label: 'Generation', icon: '🧠' },
  { id: 'billing', label: 'Billing', icon: '💳' },
];

export function SettingsPage() {
  // Stripe returns people to /app/settings?checkout=…, and every plan-limit
  // notice links to ?tab=billing — both should land on the billing tab rather
  // than on the profile.
  const [params] = useSearchParams();
  const [tab, setTab] = useState(() => {
    if (params.get('checkout')) return 'billing';
    const requested = params.get('tab');
    return TABS.some((entry) => entry.id === requested) ? (requested as string) : 'profile';
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">Settings</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Manage your account and preferences.</p>
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
  const user = app.authStore((s) => s.session?.user);

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
        <Field label="Username">
          <Input value={user.username} disabled />
        </Field>
        <Field label="Email">
          <Input value={user.email} disabled />
        </Field>
      </CardBody>
    </Card>
  );
}

function AppearanceTab() {
  const app = useApp();
  const theme = app.settingsStore((s) => s.theme);
  const setTheme = app.settingsStore((s) => s.setTheme);
  const completedTours = app.tourStore((s) => s.completedTours);
  const resetTours = app.tourStore((s) => s.resetTours);

  function replayTours() {
    resetTours();
    toast({ variant: 'success', title: 'Walkthroughs reset', description: 'They will run again on your next visit.' });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardBody className="space-y-4">
          <h3 className="font-semibold text-slate-900 dark:text-white">Theme</h3>
          <div className="grid grid-cols-3 gap-3">
            {(['light', 'dark', 'system'] as const).map((option) => (
              <button
                key={option}
                onClick={() => setTheme(option)}
                className={`rounded-xl border p-4 text-center text-sm font-medium capitalize transition-colors ${
                  theme === option
                    ? 'border-brand-600 bg-brand-50 text-brand-700 dark:border-brand-500 dark:bg-brand-500/10 dark:text-brand-400'
                    : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-800 dark:text-slate-300'
                }`}
              >
                <span className="mb-2 block text-xl">{option === 'light' ? '☀️' : option === 'dark' ? '🌙' : '💻'}</span>
                {option}
              </button>
            ))}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-white">Guided walkthroughs</h3>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              The short tours that run the first time you open a deck and the study setup.
            </p>
          </div>
          <Button variant="outline" onClick={replayTours} disabled={completedTours.length === 0}>
            {completedTours.length === 0 ? 'Not seen yet' : 'Show them again'}
          </Button>
        </CardBody>
      </Card>
    </div>
  );
}

function GenerationTab() {
  const app = useApp();
  const defaults = app.settingsStore((s) => s.generationDefaults);
  const updateDefaults = app.settingsStore((s) => s.updateGenerationDefaults);

  return (
    <div className="space-y-6">
      <Card>
        <CardBody className="space-y-4">
          <h3 className="font-semibold text-slate-900 dark:text-white">Default generation settings</h3>
          <Field label="Default card count">
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
            label="Auto-categorize by default"
          />
          <Switch
            checked={defaults.includeHints}
            onChange={(v) => updateDefaults({ includeHints: v })}
            label="Include hints by default"
          />
          <Switch
            checked={defaults.includeExplanations}
            onChange={(v) => updateDefaults({ includeExplanations: v })}
            label="Include explanations by default"
          />
        </CardBody>
      </Card>
    </div>
  );
}

/** Plans with a Stripe price behind them. Everything else is what you get for free. */
const PURCHASABLE_PLANS: Plan[] = ['pro', 'lifetime'];

/**
 * Plans owned outright rather than rented.
 *
 * Kept as a list rather than a `plan === 'lifetime'` test scattered through
 * the panel: it decides the wording, the price line, and whether there is
 * anything left to sell someone.
 */
const ONE_TIME_PLANS: Plan[] = ['lifetime'];

/** What each plan costs, for the button and the card. Display only — Stripe holds the real prices. */
const PLAN_PRICES: Record<Plan, string> = {
  free: 'Free',
  pro: '$4 / month',
  lifetime: '$39 once',
};

/**
 * What the subscription means, in the terms someone would ask about it: when
 * am I next charged, when does this stop, and is anything wrong.
 *
 * `past_due` is the one worth being clear about — the plan still works, and
 * saying so avoids a support message from someone who thinks they have lost
 * access when they have not.
 */
function describeSubscription(subscription: AccountSubscription): string {
  // A plan bought outright has no renewal, no end date and nothing to cancel,
  // so none of the questions below apply to it.
  if (ONE_TIME_PLANS.includes(subscription.plan)) {
    return 'Bought outright. There is nothing to renew and nothing to cancel.';
  }

  const ends = subscription.currentPeriodEnd
    ? new Date(subscription.currentPeriodEnd).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : undefined;

  if (subscription.status === 'past_due') {
    return ends
      ? `Your last payment didn’t go through. We’ll keep retrying, and you keep ${subscription.plan} until ${ends}.`
      : 'Your last payment didn’t go through. We’ll keep retrying, and your plan still works in the meantime.';
  }
  if (subscription.cancelAtPeriodEnd) {
    return ends
      ? `Cancelled. You keep ${subscription.plan} until ${ends}, then move back to free.`
      : `Cancelled. You keep ${subscription.plan} until the current period ends.`;
  }
  if (subscription.status === 'active' || subscription.status === 'trialing') {
    return ends ? `Renews on ${ends}.` : 'Active.';
  }
  if (subscription.status === 'canceled') return 'This subscription has ended.';
  return `Status: ${subscription.status}.`;
}

/**
 * Stripe sends people back the instant they pay, which is usually before its
 * webhook has reached us — so the plan on screen would still say free. Rather
 * than show that and be wrong, the session is re-read a few times until the
 * upgrade lands.
 *
 * Waits for the plan they actually bought, not merely for something other than
 * free. Watching for "not free" meant a Pro subscriber buying Lifetime matched
 * on the very first read and was congratulated on the plan they already had.
 */
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
  const user = app.authStore((s) => s.session?.user);
  const changePlan = app.authStore((s) => s.changePlan);
  const quota = useUploadQuota();
  const billing = app.services.billing;

  const [params, setParams] = useSearchParams();
  const [starting, setStarting] = useState<Plan | null>(null);
  const [activating, setActivating] = useState(false);
  const [subscription, setSubscription] = useState<AccountSubscription | null>(null);
  const [openingPortal, setOpeningPortal] = useState(false);

  // Re-read after an upgrade lands so the panel is not describing the old
  // subscription — `activating` flipping back to false is the signal.
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

    // What checkout says was bought — see the success URL in
    // `create-checkout-session`.
    const purchasedParam = params.get('plan');
    const purchased: Plan = PURCHASABLE_PLANS.includes(purchasedParam as Plan)
      ? (purchasedParam as Plan)
      : 'pro';

    // Cleared straight away so a refresh does not replay the message, and so a
    // bookmarked settings URL is not permanently mid-checkout.
    const next = new URLSearchParams(params);
    next.delete('checkout');
    next.delete('plan');
    setParams(next, { replace: true });

    if (outcome === 'cancelled') {
      toast({ variant: 'info', title: 'Checkout cancelled', description: 'You have not been charged.' });
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
                title: upgraded === 'lifetime' ? 'Auto Cards is yours' : 'You’re on Pro',
                description:
                  upgraded === 'lifetime'
                    ? 'Bought outright, so there is nothing to renew. Your new allowance is live.'
                    : 'Your new allowance is live.',
              }
            : {
                variant: 'info',
                title: 'Payment received',
                description: 'Your plan is taking a moment to activate. Refresh in a minute.',
              },
        );
      })
      .finally(() => setActivating(false));
  }, [app, params, setParams]);

  if (!user) return null;

  const canSwitchPlans = isAdmin(user);
  const ownsOutright = ONE_TIME_PLANS.includes(user.plan);

  async function upgrade(plan: Plan) {
    if (!billing) return;
    setStarting(plan);
    try {
      // Leaves the app entirely — Stripe hosts the payment page, so no card
      // details ever touch this origin.
      window.location.href = await billing.startCheckout(plan as PurchasablePlan);
    } catch (error) {
      toast({
        variant: 'error',
        title: error instanceof Error ? error.message : 'Could not start the checkout.',
      });
      setStarting(null);
    }
  }

  /**
   * The admin comp path. `admin_set_plan` refuses a non-admin server-side, and
   * this used to be called without awaiting or catching — so the refusal
   * rejected into nothing and the button looked like it had worked.
   */
  async function comp(plan: Plan) {
    try {
      await changePlan(plan);
      toast({ variant: 'success', title: `Switched to ${plan}` });
    } catch (error) {
      toast({
        variant: 'error',
        title: error instanceof Error ? error.message : 'Could not change that plan.',
      });
    }
  }

  async function manageBilling() {
    if (!billing) return;
    setOpeningPortal(true);
    try {
      // Cancelling, resuming and card changes all happen on Stripe's own
      // pages — see `create-portal-session` for why they are not rebuilt here.
      window.location.href = await billing.openPortal();
    } catch (error) {
      toast({
        variant: 'error',
        title: error instanceof Error ? error.message : 'Could not open your billing.',
      });
      setOpeningPortal(false);
    }
  }

  return (
    <div className="space-y-4">
      {activating && (
        <Card>
          <CardBody className="text-sm text-slate-500 dark:text-slate-400">
            Payment received. Activating your plan…
          </CardBody>
        </Card>
      )}

      {subscription && (
        <Card>
          <CardBody className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-slate-900 dark:text-white">
                  {ownsOutright ? 'Your plan' : 'Your subscription'}
                </h3>
                {subscription.status === 'past_due' && <Badge variant="warning">Payment failed</Badge>}
                {subscription.cancelAtPeriodEnd && <Badge variant="info">Cancelling</Badge>}
              </div>
              <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                {describeSubscription(subscription)}
              </p>
            </div>
            <Button variant="outline" onClick={() => void manageBilling()} disabled={openingPortal}>
              {/* Nothing to manage on a plan owned outright — the portal is
                  only where the receipt lives. */}
              {openingPortal ? 'Opening…' : ownsOutright ? 'Receipts' : 'Manage billing'}
            </Button>
          </CardBody>
        </Card>
      )}
      <Card>
        <CardBody className="space-y-2">
          <div className="flex items-baseline justify-between">
            <h3 className="font-semibold text-slate-900 dark:text-white">Uploads this month</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {quota.used} / {formatLimit(quota.limit)}
            </p>
          </div>
          {quota.limit !== Number.POSITIVE_INFINITY && (
            <Progress value={quota.used} max={quota.limit} />
          )}
          <p className="text-xs text-slate-400">
            Each generation uses one, however many files it reads, whether it starts a new deck or adds to an
            existing one. Resets on the 1st.
          </p>
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {PLANS.map((plan) => {
          const limits = PLAN_LIMITS[plan];
          const isCurrent = user.plan === plan;
          // Nothing is worth selling to someone who already owns the product:
          // a lifetime holder buying Pro would be paying monthly for less.
          const forSale = billing && PURCHASABLE_PLANS.includes(plan) && !ownsOutright;
          return (
            <Card key={plan} className={isCurrent ? 'border-2 border-brand-600 dark:border-brand-500' : undefined}>
              <CardBody>
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold capitalize text-slate-900 dark:text-white">{plan}</h3>
                  {isCurrent && <Badge variant="info">Current</Badge>}
                </div>
                <p className="mt-0.5 text-xs font-medium text-slate-600 dark:text-slate-300">{PLAN_PRICES[plan]}</p>
                <ul className="mt-3 space-y-1.5 text-xs text-slate-500 dark:text-slate-400">
                  <li>{formatLimit(limits.monthlyUploads)} uploads/mo</li>
                  <li>{formatLimit(limits.maxDecks)} decks</li>
                  <li>{formatLimit(limits.maxPagesPerPdf)} pages per PDF or slide deck</li>
                </ul>
                {!isCurrent && forSale && (
                  <Button
                    size="sm"
                    className="mt-4 w-full"
                    disabled={starting !== null}
                    onClick={() => void upgrade(plan)}
                  >
                    {starting === plan
                      ? 'Opening checkout…'
                      : ONE_TIME_PLANS.includes(plan)
                        ? 'Buy lifetime'
                        : `Upgrade to ${plan}`}
                  </Button>
                )}
                {!isCurrent && canSwitchPlans && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2 w-full"
                    onClick={() => void comp(plan)}
                  >
                    Switch to {plan}
                  </Button>
                )}
              </CardBody>
            </Card>
          );
        })}
      </div>

      {!billing && (
        <p className="text-xs text-slate-400">Checkout isn’t switched on in this build, so plans are read-only here.</p>
      )}
    </div>
  );
}

function formatLimit(value: number): string {
  return value === Number.POSITIVE_INFINITY ? 'Unlimited' : String(value);
}
