import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../../lib/appContext';
import { Button, Field, Input } from '../../components/ui';

export function SignUpPage() {
  const app = useApp();
  const navigate = useNavigate();
  const signUp = app.authStore((s) => s.signUp);
  const status = app.authStore((s) => s.status);
  const error = app.authStore((s) => s.error);
  const errorField = app.authStore((s) => s.errorField);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const ok = await signUp({ name, email, password });
    if (ok) navigate('/app', { replace: true });
  }

  return (
    <div className="space-y-5">
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Full name">
          <Input
            required
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Alex Rivera"
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
        <Field label="Password" hint="8+ characters">
          <Input
            type="password"
            required
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
      <p className="text-center text-xs text-slate-400 dark:text-slate-500">
        Auth is mocked for this preview — any valid-looking email works.
      </p>
    </div>
  );
}
