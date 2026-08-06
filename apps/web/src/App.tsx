import { Route, Routes } from 'react-router-dom';
import { useThemeEffect } from './lib/useTheme';
import { RequireAuth } from './components/layout/RequireAuth';
import { AppLayout } from './components/layout/AppLayout';
import { MarketingLayout } from './components/layout/MarketingLayout';
import { AuthLayout } from './components/layout/AuthLayout';
import { Toaster } from './components/ui';
import { LandingPage } from './features/marketing/LandingPage';
import { SignInPage } from './features/auth/SignInPage';
import { SignUpPage } from './features/auth/SignUpPage';
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
      </Routes>
      <Toaster />
    </>
  );
}
