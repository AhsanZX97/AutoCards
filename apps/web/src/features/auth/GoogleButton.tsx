import { useApp } from '../../lib/appContext';
import { Button } from '../../components/ui';

/** Google's mark, in its four colours. Their brand terms require it as-is. */
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.35 0-4.34-1.58-5.05-3.71H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.95 10.71a5.41 5.41 0 0 1 0-3.42V4.96H.96a9 9 0 0 0 0 8.08l2.99-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96l2.99 2.33C4.66 5.16 6.65 3.58 9 3.58Z"
      />
    </svg>
  );
}

/**
 * The one-click way in.
 *
 * Deliberately not a shortcut past the confirmation email — Google hands over
 * an address it has already verified, which is the same thing the email is
 * there to prove. Someone typing an address they do not own still gets the
 * email; someone arriving through Google never needed one.
 *
 * `next` is where to land afterwards, carried through the round trip in the
 * return URL because a redirect off-site loses the router's state object.
 */
export function GoogleButton({ next = '/app', label = 'Continue with Google' }: {
  next?: string;
  label?: string;
}) {
  const app = useApp();
  const signInWithGoogle = app.authStore((s) => s.signInWithGoogle);
  const status = app.authStore((s) => s.status);

  function start() {
    // Absolute, because the provider needs somewhere to send a browser that is
    // no longer on this site — and it must match the allow-list in
    // `supabase/config.toml`.
    const callback = new URL('/auth/callback', window.location.origin);
    callback.searchParams.set('next', next);
    void signInWithGoogle(callback.toString());
  }

  return (
    <Button type="button" variant="outline" className="w-full" loading={status === 'loading'} onClick={start}>
      {status !== 'loading' && <GoogleMark />}
      {label}
    </Button>
  );
}
