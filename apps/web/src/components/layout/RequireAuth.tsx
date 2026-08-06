import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useApp } from '../../lib/appContext';

export function RequireAuth({ children }: { children: ReactNode }) {
  const app = useApp();
  const location = useLocation();
  const status = app.authStore((s) => s.status);
  const restore = app.authStore((s) => s.restore);
  const [hydrated, setHydrated] = useState(() => app.authStore.persist.hasHydrated());

  // The persist middleware reads localStorage asynchronously, so on first
  // mount `session` can still be null even though a session was saved —
  // restoring before hydration finishes would sign the user out every reload.
  useEffect(() => {
    if (app.authStore.persist.hasHydrated()) {
      setHydrated(true);
      return undefined;
    }
    return app.authStore.persist.onFinishHydration(() => setHydrated(true));
  }, [app]);

  useEffect(() => {
    if (hydrated && status === 'idle') void restore();
  }, [hydrated, status, restore]);

  if (!hydrated || status === 'idle' || status === 'restoring') {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  if (status !== 'authenticated') {
    return <Navigate to="/sign-in" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}
