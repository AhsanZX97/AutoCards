import { useState } from 'react';
import { PLAN_LIMITS, PLANS, type Plan } from '@autocards/core';
import { useApp } from '../../lib/appContext';
import { Avatar, Badge, Button, Card, CardBody, Field, Input, Select, Switch, Tabs } from '../../components/ui';
import { toast } from '../../components/ui/toastStore';

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
  const [name, setName] = useState(user?.name ?? '');
  const [saving, setSaving] = useState(false);

  if (!user) return null;

  async function save() {
    setSaving(true);
    await updateProfile({ name });
    setSaving(false);
    toast({ variant: 'success', title: 'Profile updated' });
  }

  return (
    <Card>
      <CardBody className="space-y-5">
        <div className="flex items-center gap-4">
          <Avatar name={user.name} initials={user.initials} avatarUrl={user.avatarUrl} size="lg" />
          <div>
            <p className="font-semibold text-slate-900 dark:text-white">{user.name}</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">{user.email}</p>
          </div>
        </div>
        <Field label="Full name">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
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
                  ? 'border-indigo-600 bg-indigo-50 text-indigo-700 dark:border-indigo-500 dark:bg-indigo-500/10 dark:text-indigo-400'
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
  const apiKey = app.settingsStore((s) => s.openRouterApiKey);
  const setApiKey = app.settingsStore((s) => s.setApiKey);
  const defaults = app.settingsStore((s) => s.generationDefaults);
  const updateDefaults = app.settingsStore((s) => s.updateGenerationDefaults);
  const [keyInput, setKeyInput] = useState(apiKey);

  return (
    <div className="space-y-6">
      <Card>
        <CardBody className="space-y-4">
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-white">OpenRouter API key</h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Generation is currently mocked. Adding a key here won't switch it over yet — that's a follow-up.
            </p>
          </div>
          <Field label="API key">
            <Input
              type="password"
              placeholder="sk-or-…"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
            />
          </Field>
          <div className="flex justify-end">
            <Button
              onClick={() => {
                setApiKey(keyInput);
                toast({ variant: 'info', title: 'Key saved locally', description: 'Still using mocked generation for now.' });
              }}
            >
              Save key
            </Button>
          </div>
        </CardBody>
      </Card>

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

  if (!user) return null;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {PLANS.map((plan) => {
        const limits = PLAN_LIMITS[plan];
        const isCurrent = user.plan === plan;
        return (
          <Card key={plan} className={isCurrent ? 'border-2 border-indigo-600 dark:border-indigo-500' : undefined}>
            <CardBody>
              <div className="flex items-center justify-between">
                <h3 className="font-semibold capitalize text-slate-900 dark:text-white">{plan}</h3>
                {isCurrent && <Badge variant="info">Current</Badge>}
              </div>
              <ul className="mt-3 space-y-1.5 text-xs text-slate-500 dark:text-slate-400">
                <li>{formatLimit(limits.monthlyUploads)} uploads/mo</li>
                <li>{formatLimit(limits.maxDecks)} decks</li>
                <li>{formatLimit(limits.maxPagesPerPdf)} pages per PDF</li>
                <li>{limits.byoKey ? 'Bring your own key' : 'Shared generation'}</li>
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
  );
}

function formatLimit(value: number): string {
  return value === Number.POSITIVE_INFINITY ? 'Unlimited' : String(value);
}
