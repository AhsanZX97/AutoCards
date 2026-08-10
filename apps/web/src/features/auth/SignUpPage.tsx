import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MIN_PASSWORD_LENGTH } from '@autocards/core';
import { useApp } from '../../lib/appContext';
import { Button, Field, Input } from '../../components/ui';

export function SignUpPage() {
  const app = useApp();
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
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Check your email</h2>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            We sent a confirmation link to{' '}
            <span className="font-semibold text-slate-700 dark:text-slate-200">{pendingEmail}</span>.
            Click it to confirm your account, then sign in.
          </p>
        </div>
        <Link
          to="/sign-in"
          className="inline-block rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600"
        >
          Go to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Username" hint="3–20 chars, lowercase, a–z, 0–9, _">
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
        <Field label="Email">
          <Input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            error={errorField === 'email' ? error ?? undefined : undefined}
          />
        </Field>
        <Field label="Password" hint={`${MIN_PASSWORD_LENGTH}+ characters`}>
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
        {error && !errorField && <p className="text-sm font-medium text-rose-600 dark:text-rose-400">{error}</p>}
        <Button type="submit" className="w-full" loading={status === 'loading'}>
          Create account
        </Button>
      </form>
      <p className="text-center text-sm text-slate-500 dark:text-slate-400">
        Already have an account?{' '}
        <Link to="/sign-in" className="font-semibold text-brand-700 hover:text-brand-600 dark:text-brand-400">
          Sign in
        </Link>
      </p>
    </div>
  );
}
