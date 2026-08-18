import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../../lib/appContext';
import { useT } from '../../lib/i18n';
import { Button, Field, Input } from '../../components/ui';
import { GoogleButton } from './GoogleButton';
import { OrDivider } from './OrDivider';

/**
 * Where to land after signing in, rebuilt from the location `RequireAuth`
 * stored.
 *
 * The query string and fragment are part of that destination, not decoration —
 * reading only `pathname` dropped them, which is how anything carrying state
 * in the URL lost it the moment sign-in stood in the way.
 */
function returnTo(state: unknown): string {
  const from = (state as { from?: { pathname?: string; search?: string; hash?: string } } | null)?.from;
  if (!from?.pathname) return '/app';
  // Only ever an internal path — this comes from our own router state, and a
  // relative path cannot be turned into an off-site redirect.
  return `${from.pathname}${from.search ?? ''}${from.hash ?? ''}`;
}

export function SignInPage() {
  const app = useApp();
  const t = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const signIn = app.authStore((s) => s.signIn);
  const status = app.authStore((s) => s.status);
  const error = app.authStore((s) => s.error);
  const errorField = app.authStore((s) => s.errorField);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const ok = await signIn({ email, password });
    if (ok) navigate(returnTo(location.state), { replace: true });
  }

  return (
    <div className="space-y-5">
      {/* Above the form, not inside it: with Google at the top, an error about
          Google shown down by the submit button reads as a form error. Field
          errors still render against their own input. */}
      {error && !errorField && (
        <p className="text-sm font-medium text-rose-600 dark:text-rose-400">{error}</p>
      )}

      <GoogleButton next={returnTo(location.state)} label={t('auth.signIn.google')} />
      <OrDivider />

      <form onSubmit={onSubmit} className="space-y-4">
        <Field label={t('common.email')}>
          <Input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('auth.emailPlaceholder')}
            error={errorField === 'email' ? error ?? undefined : undefined}
          />
        </Field>
        <Field label={t('common.password')}>
          <Input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            error={errorField === 'password' ? error ?? undefined : undefined}
          />
        </Field>
        <div className="flex justify-end">
          <Link
            to="/forgot-password"
            className="text-sm font-medium text-brand-700 hover:text-brand-600 dark:text-brand-400"
          >
            {t('auth.signIn.forgotPassword')}
          </Link>
        </div>
        <Button type="submit" className="w-full" loading={status === 'loading'}>
          {t('auth.signIn.submit')}
        </Button>
      </form>

      <p className="text-center text-sm text-slate-500 dark:text-slate-400">
        {t('auth.signIn.noAccount')}{' '}
        <Link to="/sign-up" className="font-semibold text-brand-700 hover:text-brand-600 dark:text-brand-400">
          {t('auth.signIn.signUpLink')}
        </Link>
      </p>
    </div>
  );
}
