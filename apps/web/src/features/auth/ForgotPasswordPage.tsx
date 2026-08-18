import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../../lib/appContext';
import { useT } from '../../lib/i18n';
import { Button, Field, Input } from '../../components/ui';

/**
 * Asks for the reset email.
 *
 * Always reports the same thing back, whether or not that address has an
 * account — see `requestPasswordReset`. The confirmation is worded so it reads
 * naturally either way rather than sounding evasive.
 */
export function ForgotPasswordPage() {
  const app = useApp();
  const t = useT();
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!email.trim()) return;
    setSending(true);
    // The link has to come back to this origin, and this exact path has to be
    // on the project's redirect allow-list.
    await app.services.auth.requestPasswordReset(email, `${window.location.origin}/reset-password`);
    setSending(false);
    setSent(true);
  }

  if (sent) {
    return (
      <div className="space-y-5 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-100 text-2xl dark:bg-brand-900">
          ✉️
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">{t('auth.forgotPassword.checkEmailTitle')}</h2>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            {t('auth.forgotPassword.checkEmailBody', { email: email.trim() })}
          </p>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {t('auth.forgotPassword.notArrived')}{' '}
          <button
            onClick={() => setSent(false)}
            className="font-semibold text-brand-700 hover:text-brand-600 dark:text-brand-400"
          >
            {t('auth.forgotPassword.tryAnother')}
          </button>
          .
        </p>
        <Link
          to="/sign-in"
          className="inline-block rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600"
        >
          {t('auth.forgotPassword.backToSignIn')}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label={t('common.email')}>
          <Input
            type="email"
            required
            autoFocus
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder={t('auth.emailPlaceholder')}
          />
        </Field>
        <Button type="submit" className="w-full" loading={sending}>
          {t('auth.forgotPassword.submit')}
        </Button>
      </form>

      <p className="text-center text-sm text-slate-500 dark:text-slate-400">
        {t('auth.forgotPassword.remembered')}{' '}
        <Link to="/sign-in" className="font-semibold text-brand-700 hover:text-brand-600 dark:text-brand-400">
          {t('auth.signIn.submit')}
        </Link>
      </p>
    </div>
  );
}
