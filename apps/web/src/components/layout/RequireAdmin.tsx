import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { isAdmin } from '@autocards/core';
import { useApp } from '../../lib/appContext';

/**
 * Keeps the owner-only screens off everybody else's router.
 *
 * This is presentation, not security: the flag it reads is on a profile the
 * client cannot write, but a determined visitor can still call the function
 * behind the screen. That call is where the real check lives — `admin_analytics`
 * verifies `is_admin` server-side and raises rather than returning data. This
 * only decides whether it is worth rendering a page that would fail.
 *
 * Must sit inside `RequireAuth`, which is what waits for the session to be
 * restored; without that a reload would bounce the owner out on first paint.
 */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const app = useApp();
  const user = app.authStore((s) => s.session?.user);

  if (!isAdmin(user)) return <Navigate to="/app" replace />;
  return <>{children}</>;
}
