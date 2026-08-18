import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MIN_PASSWORD_LENGTH } from '@autocards/core';
import { useApp } from '../../lib/appContext';
import { useT } from '../../lib/i18n';
import { Button, Field, Input } from '../../components/ui';
import { GoogleButton } from './GoogleButton';
import { OrDivider } from './OrDivider';

export function SignUpPage() {
  const app = useApp();
  const t = useT();
  const navigate = useNavigate();
  const signUp = app.authStore((s) => s.signUp);
  const status = app.authStore((s) => s.status);
  const error = app.authStore((s) => s.error);
  const errorField = app.authStore((s) => s.errorField);
  const pendingEmail = app.authStore((s) => s.pendingConfirmationEmail);

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const ok = await signUp({ username, email, password });
    if (ok) navigate('/app', { replace: true });
  }

  if (pendingEmail) {
    return (
      <div className="space-y-5 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-100 text-2xl dark:bg-brand-900">
          ✉️
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">{t('auth.signUp.checkEmailTitle')}</h2>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            {t('auth.signUp.checkEmailBody', { email: pendingEmail })}
          </p>
        </div>
        <Link
          to="/sign-in"
          className="inline-block rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600"
        >
          {t('auth.signUp.goToSignIn')}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {error && !errorField && (
        <p className="text-sm font-medium text-rose-600 dark:text-rose-400">{error}</p>
      )}

      {/* The fast way in, and the only one that skips the confirmation email —
          Google has already proved the address belongs to them. Whoever picks
          the form below still gets the email, because we have no such proof. */}
      <GoogleButton label={t('auth.signUp.google')} />
      <OrDivider />

      <form onSubmit={onSubmit} className="space-y-4">
        <Field label={t('common.username')} hint={t('auth.signUp.usernameHint')}>
          <Input
            required
            autoCapitalize="none"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="alex_rivera"
            error={errorField === 'name' ? error ?? undefined : undefined}
          />
        </Field>
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
        <Field label={t('common.password')} hint={t('auth.signUp.passwordHint', { min: MIN_PASSWORD_LENGTH })}>
          <Input
            type="password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            error={errorField === 'password' ? error ?? undefined : undefined}
          />
        </Field>
        <Button type="submit" className="w-full" loading={status === 'loading'}>
          {t('auth.signUp.submit')}
        </Button>
      </form>
      <p className="text-center text-sm text-slate-500 dark:text-slate-400">
        {t('auth.signUp.hasAccount')}{' '}
        <Link to="/sign-in" className="font-semibold text-brand-700 hover:text-brand-600 dark:text-brand-400">
          {t('auth.signUp.signInLink')}
        </Link>
      </p>
    </div>
  );
}
