import type { ReactNode } from 'react';
import { MarketingLayout } from '../components/layout/MarketingLayout';
import { AuthLayout } from '../components/layout/AuthLayout';
import { LandingPage } from '../features/marketing/LandingPage';
import { DemoPage } from '../features/marketing/demo/DemoPage';
import { PrivacyPage } from '../features/marketing/PrivacyPage';
import { TermsPage } from '../features/marketing/TermsPage';
import { SignUpPage } from '../features/auth/SignUpPage';
import { useT } from '../lib/i18n';
import { marketingRoutes } from './marketingRoutes';

export type PublicRoute = {
  path: string;
  element: ReactNode;
  title: string;
  description: string;
  changefreq?: 'weekly' | 'monthly' | 'yearly';
};

/**
 * `AuthLayout`'s heading text is translated, which needs a hook — so unlike
 * the other base routes, this one can't be a plain JSX literal at module
 * scope and gets its own small route component instead.
 */
function SignUpRoute() {
  const t = useT();
  return (
    <AuthLayout title={t('auth.signUp.title')} subtitle={t('auth.signUp.subtitle')}>
      <SignUpPage />
    </AuthLayout>
  );
}

const baseRoutes: PublicRoute[] = [
  {
    path: '/',
    element: (
      <MarketingLayout>
        <LandingPage />
      </MarketingLayout>
    ),
    title: 'Auto Cards — Turn your notes into flashcards',
    description:
      'Upload your slides, notes or a chapter and get a study-ready, gamified flashcard deck in seconds.',
    changefreq: 'weekly',
  },
  {
    path: '/demo',
    element: (
      <MarketingLayout>
        <DemoPage />
      </MarketingLayout>
    ),
    title: 'Live demo — Auto Cards',
    description:
      'Walk through uploading a document, generating a deck and studying it with spaced repetition — no account needed.',
    changefreq: 'monthly',
  },
  {
    path: '/privacy',
    element: (
      <MarketingLayout>
        <PrivacyPage />
      </MarketingLayout>
    ),
    title: 'Privacy Policy — Auto Cards',
    description: 'How Auto Cards collects, stores and protects your data.',
    changefreq: 'yearly',
  },
  {
    path: '/terms',
    element: (
      <MarketingLayout>
        <TermsPage />
      </MarketingLayout>
    ),
    title: 'Terms of Service — Auto Cards',
    description: 'The terms that govern your use of Auto Cards.',
    changefreq: 'yearly',
  },
  {
    path: '/sign-up',
    element: <SignUpRoute />,
    title: 'Sign up — Auto Cards',
    description: 'Create a free Auto Cards account and start turning your notes into flashcards.',
    changefreq: 'yearly',
  },
];

export const publicRoutes: PublicRoute[] = [...baseRoutes, ...marketingRoutes];
