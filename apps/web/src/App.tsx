import { Route, Routes } from 'react-router-dom';
import { useThemeEffect } from './lib/useTheme';
import { RequireAuth } from './components/layout/RequireAuth';
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

export default function App() {
  useThemeEffect();

  return (
    <>
      <Routes>
        <Route path="/" element={<MarketingLayout><LandingPage /></MarketingLayout>} />
        <Route path="/privacy" element={<MarketingLayout><PrivacyPage /></MarketingLayout>} />
        <Route path="/terms" element={<MarketingLayout><TermsPage /></MarketingLayout>} />
        <Route
          path="/sign-in"
          element={
            <AuthLayout title="Welcome back" subtitle="Sign in to keep studying where you left off.">
              <SignInPage />
            </AuthLayout>
          }
        />
        <Route
          path="/sign-up"
          element={
            <AuthLayout title="Create your account" subtitle="Free to start. No credit card required.">
              <SignUpPage />
            </AuthLayout>
          }
        />
        <Route
          path="/forgot-password"
          element={
            <AuthLayout
              title="Reset your password"
              subtitle="We'll email you a link to set a new one."
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
            <AuthLayout title="Almost there" subtitle="Finishing your sign-in.">
              <AuthCallbackPage />
            </AuthLayout>
          }
        />
        {/* Outside RequireAuth on purpose: whoever lands here is mid-recovery,
            holding a temporary session rather than a signed-in one. */}
        <Route
          path="/reset-password"
          element={
            <AuthLayout title="Choose a new password" subtitle="Then you're straight back in.">
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
        {/* The host serves index.html for every path so a refresh works, which
            means an unknown URL reaches the router rather than a 404 page. */}
        <Route path="*" element={<MarketingLayout><NotFoundPage /></MarketingLayout>} />
      </Routes>
      <Toaster />
    </>
  );
}
