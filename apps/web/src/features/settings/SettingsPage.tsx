import { useState } from 'react';
import { PLAN_LIMITS, PLANS, type Plan } from '@autocards/core';
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
  const [tab, setTab] = useState('profile');

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
  const updateProfile = app.authStore((s) => s.updateProfile);
  const [username, setUsername] = useState(user?.username ?? '');
  const [saving, setSaving] = useState(false);

  if (!user) return null;

  async function save() {
    setSaving(true);
    await updateProfile({ username });
    setSaving(false);
    toast({ variant: 'success', title: 'Profile updated' });
  }

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
        <Field label="Username" hint="3–20 chars, lowercase, a–z, 0–9, _">
          <Input value={username} onChange={(e) => setUsername(e.target.value)} autoCapitalize="none" />
        </Field>
        <Field label="Email">
          <Input value={user.email} disabled />
        </Field>
        <div className="flex justify-end">
          <Button onClick={save} loading={saving}>
            Save changes
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

function AppearanceTab() {
  const app = useApp();
  const theme = app.settingsStore((s) => s.theme);
  const setTheme = app.settingsStore((s) => s.setTheme);

  return (
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

function BillingTab() {
  const app = useApp();
  const user = app.authStore((s) => s.session?.user);
  const changePlan = app.authStore((s) => s.changePlan);
  const quota = useUploadQuota();

  if (!user) return null;

  return (
    <div className="space-y-4">
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
            Each PDF you convert into cards uses one, whether it starts a new deck or adds to an existing one. Resets
            on the 1st.
          </p>
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {PLANS.map((plan) => {
          const limits = PLAN_LIMITS[plan];
          const isCurrent = user.plan === plan;
          return (
            <Card key={plan} className={isCurrent ? 'border-2 border-brand-600 dark:border-brand-500' : undefined}>
              <CardBody>
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold capitalize text-slate-900 dark:text-white">{plan}</h3>
                  {isCurrent && <Badge variant="info">Current</Badge>}
                </div>
                <ul className="mt-3 space-y-1.5 text-xs text-slate-500 dark:text-slate-400">
                  <li>{formatLimit(limits.monthlyUploads)} uploads/mo</li>
                  <li>{formatLimit(limits.maxDecks)} decks</li>
                  <li>{formatLimit(limits.maxPagesPerPdf)} pages per PDF</li>
                </ul>
                {!isCurrent && (
                  <Button size="sm" variant="outline" className="mt-4 w-full" onClick={() => changePlan(plan as Plan)}>
                    Switch to {plan}
                  </Button>
                )}
              </CardBody>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function formatLimit(value: number): string {
  return value === Number.POSITIVE_INFINITY ? 'Unlimited' : String(value);
}
