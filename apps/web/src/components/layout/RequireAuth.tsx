import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useApp } from '../../lib/appContext';

export function RequireAuth({ children }: { children: ReactNode }) {
  const app = useApp();
  const location = useLocation();
  const status = app.authStore((s) => s.status);
  const session = app.authStore((s) => s.session);
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

  // Supabase re-announces the session every time the tab regains visibility,
  // which runs `restore` again and puts the status back to 'restoring'. Showing
  // the spinner for that unmounts the whole authed tree, and anything mid-flight
  // in it dies — a deck generation aborts on unmount and silently drops the user
  // back on the create screen. A session we already hold is re-validated in the
  // background instead.
  const revalidating = status === 'restoring' && session !== null;

  if (!hydrated || status === 'idle' || (status === 'restoring' && !revalidating)) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  if (status !== 'authenticated' && !revalidating) {
    return <Navigate to="/sign-in" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}
