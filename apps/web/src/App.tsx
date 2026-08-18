import { Route, Routes } from 'react-router-dom';
import { useThemeEffect } from './lib/useTheme';
import { useLocaleEffect, useT } from './lib/i18n';
import { RequireAuth } from './components/layout/RequireAuth';
import { RequireAdmin } from './components/layout/RequireAdmin';
import { AppLayout } from './components/layout/AppLayout';
import { MarketingLayout } from './components/layout/MarketingLayout';
import { AuthLayout } from './components/layout/AuthLayout';
import { Toaster } from './components/ui';
import { LandingPage } from './features/marketing/LandingPage';
import { NotFoundPage } from './features/marketing/NotFoundPage';
import { PrivacyPage } from './features/marketing/PrivacyPage';
import { TermsPage } from './features/marketing/TermsPage';
import { SignInPage } from './features/auth/SignInPage';
import { SignUpPage } from './features/auth/SignUpPage';
import { ForgotPasswordPage } from './features/auth/ForgotPasswordPage';
import { ResetPasswordPage } from './features/auth/ResetPasswordPage';
import { AuthCallbackPage } from './features/auth/AuthCallbackPage';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { DeckLibraryPage } from './features/decks/DeckLibraryPage';
import { CreateDeckPage } from './features/decks/CreateDeckPage';
import { DeckDetailPage } from './features/decks/DeckDetailPage';
import { StudySetupPage } from './features/study/StudySetupPage';
import { StudyRunnerPage } from './features/study/StudyRunnerPage';
import { StudyResultsPage } from './features/study/StudyResultsPage';
import { StatsPage } from './features/stats/StatsPage';
import { SettingsPage } from './features/settings/SettingsPage';
import { AnalyticsPage } from './features/admin/AnalyticsPage';

export default function App() {
  useThemeEffect();
  useLocaleEffect();
  const t = useT();

  return (
    <>
      <Routes>
        <Route path="/" element={<MarketingLayout><LandingPage /></MarketingLayout>} />
        <Route path="/privacy" element={<MarketingLayout><PrivacyPage /></MarketingLayout>} />
        <Route path="/terms" element={<MarketingLayout><TermsPage /></MarketingLayout>} />
        <Route
          path="/sign-in"
          element={
            <AuthLayout title={t('auth.signIn.title')} subtitle={t('auth.signIn.subtitle')}>
              <SignInPage />
            </AuthLayout>
          }
        />
        <Route
          path="/sign-up"
          element={
            <AuthLayout title={t('auth.signUp.title')} subtitle={t('auth.signUp.subtitle')}>
              <SignUpPage />
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
                <DashboardPage />
              </AppLayout>
            </RequireAuth>
          }
        />
        <Route
          path="/app/decks"
          element={
            <RequireAuth>
              <AppLayout>
                <DeckLibraryPage />
              </AppLayout>
            </RequireAuth>
          }
        />
        <Route
          path="/app/decks/new"
          element={
            <RequireAuth>
              <AppLayout>
                <CreateDeckPage />
              </AppLayout>
            </RequireAuth>
          }
        />
        <Route
          path="/app/decks/:deckId"
          element={
            <RequireAuth>
              <AppLayout>
                <DeckDetailPage />
              </AppLayout>
            </RequireAuth>
          }
        />
        <Route
          path="/app/study/:deckId"
          element={
            <RequireAuth>
              <AppLayout>
                <StudySetupPage />
              </AppLayout>
            </RequireAuth>
          }
        />
        <Route
          path="/app/study/:deckId/run"
          element={
            <RequireAuth>
              <StudyRunnerPage />
            </RequireAuth>
          }
        />
        <Route
          path="/app/study/:deckId/results/:sessionId"
          element={
            <RequireAuth>
              <AppLayout>
                <StudyResultsPage />
              </AppLayout>
            </RequireAuth>
          }
        />
        <Route
          path="/app/stats"
          element={
            <RequireAuth>
              <AppLayout>
                <StatsPage />
              </AppLayout>
            </RequireAuth>
          }
        />
        <Route
          path="/app/settings"
          element={
            <RequireAuth>
              <AppLayout>
                <SettingsPage />
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
                  <AnalyticsPage />
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
