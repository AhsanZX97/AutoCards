import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../../lib/appContext';

/** Long enough for a slow exchange, short enough not to look like a hang. */
const GIVE_UP_AFTER_MS = 15_000;

/**
 * Only ever an internal path.
 *
 * `next` survives a round trip through Google, so unlike the router state
 * `RequireAuth` stores, it is a value a stranger can put in a link. Anything
 * that could leave the site — an absolute URL, or the protocol-relative
 * `//evil.test` that a bare `startsWith('/')` check waves through — is
 * discarded rather than followed.
 */
function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/app';
  return raw;
}

/**
 * Where Google sends the browser back to.
 *
 * There is nothing to do here but wait: the Supabase client picks the code out
 * of the URL on load, and `createApp`'s `onAuthStateChange` turns that into a
 * restored session. This page exists so that landing happens somewhere neutral
 * — returning straight to `/app` raced `RequireAuth`, which sees a store that
 * is still empty, concludes signed-out and bounces to the sign-in page a
 * moment before the session arrives.
 */
export function AuthCallbackPage() {
  const app = useApp();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const status = app.authStore((s) => s.status);
  const session = app.authStore((s) => s.session);
  const [timedOut, setTimedOut] = useState(false);

  // Google's own refusal — a closed consent screen, a provider that is not
  // switched on. It arrives as a query parameter, or in the fragment when the
  // client is on the implicit flow.
  const denial =
    params.get('error_description') ??
    params.get('error') ??
    new URLSearchParams(window.location.hash.replace(/^#/, '')).get('error_description');

  const next = safeNext(params.get('next'));

  useEffect(() => {
    if (denial) return undefined;
    if (session && status === 'authenticated') {
      navigate(next, { replace: true });
      return undefined;
    }
    const timer = setTimeout(() => setTimedOut(true), GIVE_UP_AFTER_MS);
    return () => clearTimeout(timer);
  }, [denial, session, status, next, navigate]);

  if (denial || timedOut) {
    return (
      <div className="space-y-5 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-2xl dark:bg-rose-900/40">
          ⚠️
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            That didn&apos;t finish
          </h2>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            {denial
              ? 'Google didn’t complete the sign-in. You can try again, or use your email and password.'
              : 'This is taking longer than it should. Try signing in again.'}
          </p>
        </div>
        <Link
          to="/sign-in"
          className="inline-block rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 py-6 text-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      <p className="text-sm text-slate-500 dark:text-slate-400">Signing you in…</p>
    </div>
  );
}
