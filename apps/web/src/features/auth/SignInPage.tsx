import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../../lib/appContext';
import { Button, Field, Input } from '../../components/ui';

export function SignInPage() {
  const app = useApp();
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
    if (ok) {
      const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? '/app';
      navigate(from, { replace: true });
    }
  }

  return (
    <div className="space-y-5">
      <form onSubmit={onSubmit} className="space-y-4">
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
        <Field label="Password">
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
        {error && !errorField && <p className="text-sm font-medium text-rose-600 dark:text-rose-400">{error}</p>}
        <Button type="submit" className="w-full" loading={status === 'loading'}>
          Sign in
        </Button>
      </form>

      <p className="text-center text-sm text-slate-500 dark:text-slate-400">
        Don&apos;t have an account?{' '}
        <Link to="/sign-up" className="font-semibold text-brand-700 hover:text-brand-600 dark:text-brand-400">
          Sign up
        </Link>
      </p>
    </div>
  );
}
