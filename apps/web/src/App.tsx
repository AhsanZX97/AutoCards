import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { useThemeEffect } from './lib/useTheme';
import { useLocaleEffect, useT } from './lib/i18n';
import { RequireAuth } from './components/layout/RequireAuth';
import { RequireAdmin } from './components/layout/RequireAdmin';
import { AppLayout } from './components/layout/AppLayout';
import { MarketingLayout } from './components/layout/MarketingLayout';
import { AuthLayout } from './components/layout/AuthLayout';
import { Toaster } from './components/ui';
import { NotFoundPage } from './features/marketing/NotFoundPage';
import { SignInPage } from './features/auth/SignInPage';
import { ForgotPasswordPage } from './features/auth/ForgotPasswordPage';
import { ResetPasswordPage } from './features/auth/ResetPasswordPage';
import { AuthCallbackPage } from './features/auth/AuthCallbackPage';
import { publicRoutes } from './seo/routes';
import { PageMeta } from './seo/PageMeta';
import { LandingJsonLd } from './seo/LandingJsonLd';

/**
 * Everything behind `RequireAuth` is loaded on demand — the landing page is a
 * crawler's and a new visitor's first paint, and it has no reason to pull in
 * the study runner, PDF extraction or the rest of the signed-in app.
 */
const DashboardPage = lazy(() => import('./features/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const DeckLibraryPage = lazy(() => import('./features/decks/DeckLibraryPage').then((m) => ({ default: m.DeckLibraryPage })));
const CreateDeckPage = lazy(() => import('./features/decks/CreateDeckPage').then((m) => ({ default: m.CreateDeckPage })));
const DeckDetailPage = lazy(() => import('./features/decks/DeckDetailPage').then((m) => ({ default: m.DeckDetailPage })));
const StudySetupPage = lazy(() => import('./features/study/StudySetupPage').then((m) => ({ default: m.StudySetupPage })));
const StudyRunnerPage = lazy(() => import('./features/study/StudyRunnerPage').then((m) => ({ default: m.StudyRunnerPage })));
const StudyResultsPage = lazy(() => import('./features/study/StudyResultsPage').then((m) => ({ default: m.StudyResultsPage })));
const StatsPage = lazy(() => import('./features/stats/StatsPage').then((m) => ({ default: m.StatsPage })));
const SettingsPage = lazy(() => import('./features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const AnalyticsPage = lazy(() => import('./features/admin/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage })));

export default function App() {
  useThemeEffect();
  useLocaleEffect();
  const t = useT();

  return (
    <>
      <PageMeta />
      <LandingJsonLd />
      <Routes>
        {publicRoutes.map((route) => (
          <Route key={route.path} path={route.path} element={route.element} />
        ))}
        <Route
          path="/sign-in"
          element={
            <AuthLayout title={t('auth.signIn.title')} subtitle={t('auth.signIn.subtitle')}>
              <SignInPage />
            </AuthLayout>
          }
        />
        <Route
          path="/forgot-password"
          element={
            <AuthLayout
              title={t('auth.forgotPassword.title')}
              subtitle={t('auth.forgotPassword.subtitle')}
            >
              <ForgotPasswordPage />
            </AuthLayout>
          }
        />
        {/* Also outside RequireAuth: the session is still being exchanged out of
            the URL when this mounts, so the guard would bounce it to sign-in a
            moment before it arrives. */}
        <Route
          path="/auth/callback"
          element={
            <AuthLayout title={t('auth.callback.title')} subtitle={t('auth.callback.subtitle')}>
              <AuthCallbackPage />
            </AuthLayout>
          }
        />
        {/* Outside RequireAuth on purpose: whoever lands here is mid-recovery,
            holding a temporary session rather than a signed-in one. */}
        <Route
          path="/reset-password"
          element={
            <AuthLayout title={t('auth.resetPassword.title')} subtitle={t('auth.resetPassword.subtitle')}>
              <ResetPasswordPage />
            </AuthLayout>
          }
        />

        <Route
          path="/app"
          element={
            <RequireAuth>
              <AppLayout>
                <Suspense fallback={null}>
                  <DashboardPage />
                </Suspense>
              </AppLayout>
            </RequireAuth>
          }
        />
        <Route
          path="/app/decks"
          element={
            <RequireAuth>
              <AppLayout>
                <Suspense fallback={null}>
                  <DeckLibraryPage />
                </Suspense>
              </AppLayout>
            </RequireAuth>
          }
        />
        <Route
          path="/app/decks/new"
          element={
            <RequireAuth>
              <AppLayout>
                <Suspense fallback={null}>
                  <CreateDeckPage />
                </Suspense>
              </AppLayout>
            </RequireAuth>
          }
        />
        <Route
          path="/app/decks/:deckId"
          element={
            <RequireAuth>
              <AppLayout>
                <Suspense fallback={null}>
                  <DeckDetailPage />
                </Suspense>
              </AppLayout>
            </RequireAuth>
          }
        />
        <Route
          path="/app/study/:deckId"
          element={
            <RequireAuth>
              <AppLayout>
                <Suspense fallback={null}>
                  <StudySetupPage />
                </Suspense>
              </AppLayout>
            </RequireAuth>
          }
        />
        <Route
          path="/app/study/:deckId/run"
          element={
            <RequireAuth>
              <Suspense fallback={null}>
                <StudyRunnerPage />
              </Suspense>
            </RequireAuth>
          }
        />
        <Route
          path="/app/study/:deckId/results/:sessionId"
          element={
            <RequireAuth>
              <AppLayout>
                <Suspense fallback={null}>
                  <StudyResultsPage />
                </Suspense>
              </AppLayout>
            </RequireAuth>
          }
        />
        <Route
          path="/app/stats"
          element={
            <RequireAuth>
              <AppLayout>
                <Suspense fallback={null}>
                  <StatsPage />
                </Suspense>
              </AppLayout>
            </RequireAuth>
          }
        />
        <Route
          path="/app/settings"
          element={
            <RequireAuth>
              <AppLayout>
                <Suspense fallback={null}>
                  <SettingsPage />
                </Suspense>
              </AppLayout>
            </RequireAuth>
          }
        />
        {/* Owner only. The gate that matters is server-side — `admin_analytics`
            checks `is_admin` itself — so this guard only spares everyone else a
            page that would refuse to load. */}
        <Route
          path="/app/analytics"
          element={
            <RequireAuth>
              <RequireAdmin>
                <AppLayout>
                  <Suspense fallback={null}>
                    <AnalyticsPage />
                  </Suspense>
                </AppLayout>
              </RequireAdmin>
            </RequireAuth>
          }
        />
        {/* The host serves index.html for every path so a refresh works, which
            means an unknown URL reaches the router rather than a 404 page. */}
        <Route path="*" element={<MarketingLayout><NotFoundPage /></MarketingLayout>} />
      </Routes>
      <Toaster />
    </>
  );
}
