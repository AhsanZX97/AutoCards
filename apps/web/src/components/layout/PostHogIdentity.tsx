import { useEffect } from 'react';
import { useApp } from '../../lib/appContext';
import { posthog } from '../../lib/posthog';

/** Keeps PostHog's anonymous browsing history attached to the right account. */
export function PostHogIdentity() {
  const app = useApp();

  useEffect(() => {
    let identifiedUserId: string | undefined;

    const syncPostHogIdentity = () => {
      const user = app.authStore.getState().session?.user;
      if (!user) {
        if (identifiedUserId) posthog?.reset();
        identifiedUserId = undefined;
        return;
      }
      if (user.id === identifiedUserId) return;

      if (identifiedUserId) posthog?.reset();
      posthog?.identify(user.id, {
        email: user.email,
        username: user.username,
        plan: user.plan,
      });
      identifiedUserId = user.id;
    };

    syncPostHogIdentity();
    return app.authStore.subscribe(syncPostHogIdentity);
  }, [app]);

  return null;
}
