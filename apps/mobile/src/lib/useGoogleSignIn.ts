import { useState } from 'react';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { router } from 'expo-router';
import { useApp } from './appContext';

/**
 * Mobile's side of Google sign-in.
 *
 * There is no browser tab to leave and come back to, so unlike web's
 * `GoogleButton` this drives the round trip itself: get the authorize URL
 * from the store without navigating anywhere (`startGoogleSignIn`), open it
 * in an in-app browser session, and hand whatever URL that session comes back
 * with to `restoreFromUrl` — the same deep-link exchange a confirmation or
 * recovery email uses, since Supabase hands back tokens the same way either
 * time.
 */
export function useGoogleSignIn() {
  const app = useApp();
  const startGoogleSignIn = app.authStore((s) => s.startGoogleSignIn);
  const [loading, setLoading] = useState(false);

  async function start() {
    setLoading(true);
    try {
      const redirectTo = Linking.createURL('callback');
      const url = await startGoogleSignIn(redirectTo);
      // A refusal already left its message in the store's `error`.
      if (!url) return;

      const result = await WebBrowser.openAuthSessionAsync(url, redirectTo);
      if (result.type !== 'success' || !result.url) {
        // Closed or cancelled the browser sheet — not a failure worth a
        // message, just back to an ordinary signed-out sign-in screen.
        app.authStore.getState().syncFromProvider(null);
        return;
      }

      const session = await app.services.auth.restoreFromUrl(result.url);
      app.authStore.getState().syncFromProvider(session);
      // Through `/` rather than straight to `/(app)` so the root redirect gets
      // a chance to send a first-time sign-up to onboarding first.
      if (session) router.replace('/');
    } catch (err) {
      app.authStore.setState({
        status: 'signed-out',
        error: err instanceof Error ? err.message : 'Could not continue with Google.',
        errorField: null,
      });
    } finally {
      setLoading(false);
    }
  }

  return { start, loading };
}
