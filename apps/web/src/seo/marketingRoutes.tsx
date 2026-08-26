import { MarketingLayout } from '../components/layout/MarketingLayout';
import { PdfToFlashcardsPage } from '../features/marketing/useCases/PdfToFlashcardsPage';
import { PowerpointToFlashcardsPage } from '../features/marketing/useCases/PowerpointToFlashcardsPage';
import { WordToFlashcardsPage } from '../features/marketing/useCases/WordToFlashcardsPage';
import { LectureNotesToFlashcardsPage } from '../features/marketing/useCases/LectureNotesToFlashcardsPage';
import { VsAnkiPage } from '../features/marketing/compare/VsAnkiPage';
import { VsQuizletPage } from '../features/marketing/compare/VsQuizletPage';
import { VsKnowtPage } from '../features/marketing/compare/VsKnowtPage';
import type { PublicRoute } from './routes';

export const marketingRoutes: PublicRoute[] = [
  {
    path: '/pdf-to-flashcards',
    element: (
      <MarketingLayout>
        <PdfToFlashcardsPage />
      </MarketingLayout>
    ),
    title: 'PDF to Flashcards — Auto Cards',
    description:
      'Upload a PDF and get a study-ready flashcard deck in seconds. Auto Cards reads the text on every page and writes the cards for you.',
    changefreq: 'monthly',
  },
  {
    path: '/powerpoint-to-flashcards',
    element: (
      <MarketingLayout>
        <PowerpointToFlashcardsPage />
      </MarketingLayout>
    ),
    title: 'PowerPoint to Flashcards — Auto Cards',
    description:
      'Upload a .pptx and Auto Cards reads every slide and its speaker notes to build a full flashcard deck automatically.',
    changefreq: 'monthly',
  },
  {
    path: '/word-to-flashcards',
    element: (
      <MarketingLayout>
        <WordToFlashcardsPage />
      </MarketingLayout>
    ),
    title: 'Word to Flashcards — Auto Cards',
    description:
      'Upload a .docx and Auto Cards reads every paragraph to turn your notes or study guide into a flashcard deck.',
    changefreq: 'monthly',
  },
  {
    path: '/lecture-notes-to-flashcards',
    element: (
      <MarketingLayout>
        <LectureNotesToFlashcardsPage />
      </MarketingLayout>
    ),
    title: 'Lecture Notes to Flashcards — Auto Cards',
    description:
      'Upload your lecture notes — Word, PDF or plain text — and Auto Cards builds a flashcard deck from what you actually wrote down.',
    changefreq: 'monthly',
  },
  {
    path: '/vs/anki',
    element: (
      <MarketingLayout>
        <VsAnkiPage />
      </MarketingLayout>
    ),
    title: 'Auto Cards vs Anki — Which Should You Use?',
    description:
      'A fair comparison of Auto Cards and Anki: pricing, scheduling algorithms, AI generation and where each one actually wins.',
    changefreq: 'monthly',
  },
  {
    path: '/vs/quizlet',
    element: (
      <MarketingLayout>
        <VsQuizletPage />
      </MarketingLayout>
    ),
    title: 'Auto Cards vs Quizlet — Which Should You Use?',
    description:
      'A fair comparison of Auto Cards and Quizlet: AI generation, existing content libraries, game modes and pricing.',
    changefreq: 'monthly',
  },
  {
    path: '/vs/knowt',
    element: (
      <MarketingLayout>
        <VsKnowtPage />
      </MarketingLayout>
    ),
    title: 'Auto Cards vs Knowt — Which Should You Use?',
    description:
      'A fair comparison of Auto Cards and Knowt: free-tier AI features, file format support and spaced repetition.',
    changefreq: 'monthly',
  },
];
