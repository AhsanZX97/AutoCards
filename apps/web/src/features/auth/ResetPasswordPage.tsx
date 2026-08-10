import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MIN_PASSWORD_LENGTH } from '@autocards/core';
import { useApp } from '../../lib/appContext';
import { Button, Field, Input } from '../../components/ui';
import { toast } from '../../components/ui/toastStore';

/**
 * Where a reset link lands.
 *
 * The link carries a recovery token in the URL fragment, which the Supabase
 * client exchanges for a short-lived session on load — so by the time this
 * renders, `updatePassword` has something to act on. That exchange is why the
 * route sits outside `RequireAuth`: the visitor is mid-recovery, not signed in
 * in the ordinary sense, and bouncing them to the sign-in screen would strand
 * them on the one page they cannot use.
 */
export function ResetPasswordPage() {
  const app = useApp();
  const navigate = useNavigate();
  const status = app.authStore((s) => s.status);

  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Undefined while the client is still working through the token in the URL.
  const [linkUsable, setLinkUsable] = useState<boolean | undefined>(undefined);

  // The token exchange happens asynchronously on load, so a moment is needed
  // before an absent session can be read as a dead link rather than a slow one.
  // The status is re-read when the timer fires rather than captured, since the
  // whole point is that it may have changed by then.
  useEffect(() => {
    if (status === 'authenticated') {
      setLinkUsable(true);
      return undefined;
    }
    // 'restoring' means the exchange is still in flight against the provider.
    // Arming the timer here would put a deadline on someone else's network
    // round-trip and call a good link expired for being slow; the status change
    // that ends the exchange re-runs this effect either way.
    if (status === 'restoring' || status === 'loading') return undefined;
    const timer = setTimeout(
      () => setLinkUsable(app.authStore.getState().status === 'authenticated'),
      2_500,
    );
    return () => clearTimeout(timer);
  }, [app, status]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirmation) {
      setError('Those two passwords don’t match.');
      return;
    }

    setSaving(true);
    try {
      await app.services.auth.updatePassword(password);
      toast({
        variant: 'success',
        title: 'Password changed',
        description: 'You’re signed in with your new password.',
      });
      navigate('/app', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not set that password.');
    } finally {
      setSaving(false);
    }
  }

  if (linkUsable === false) {
    return (
      <div className="space-y-5 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-2xl dark:bg-amber-500/20">
          ⏳
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">This link has expired</h2>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Reset links last an hour and can only be used once. Ask for a fresh one and it&apos;ll
            work.
          </p>
        </div>
        <Link
          to="/forgot-password"
          className="inline-block rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600"
        >
          Send a new link
        </Link>
      </div>
    );
  }

  if (linkUsable === undefined) {
    return (
      <div className="flex justify-center py-10">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="New password" hint={`${MIN_PASSWORD_LENGTH}+ characters`}>
        <Input
          type="password"
          required
          autoFocus
          minLength={MIN_PASSWORD_LENGTH}
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="••••••••"
        />
      </Field>
      <Field label="Confirm new password">
        <Input
          type="password"
          required
          autoComplete="new-password"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          placeholder="••••••••"
          error={error ?? undefined}
        />
      </Field>
      <Button type="submit" className="w-full" loading={saving}>
        Set new password
      </Button>
    </form>
  );
}
